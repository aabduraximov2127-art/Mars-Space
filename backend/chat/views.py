from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from accounts.models import User
from audit.services import record as audit
from core.permissions import ALL_ROLES, RolePermission, require
from core.throttles import ChatMessageThrottle

from . import services
from .models import MESSAGE_MAX_LENGTH, ChatMembership, ChatMessage, ChatRoom, RoomKind

PAGE = 50


class ContactSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)

    class Meta:
        model = User
        fields = ("id", "full_name", "role", "branch_name")
        read_only_fields = fields


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)
    sender_role = serializers.CharField(source="sender.role", read_only=True)

    class Meta:
        model = ChatMessage
        fields = ("id", "room", "sender", "sender_name", "sender_role", "body", "is_deleted", "created_at")
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_deleted:
            data["body"] = ""
        return data


class SendSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=MESSAGE_MAX_LENGTH, trim_whitespace=True)


class DirectSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()


def room_payload(room: ChatRoom, user) -> dict:
    membership = ChatMembership.objects.filter(room=room, user=user).first()
    last_read = membership.last_read_at if membership else None
    unread = room.messages.filter(is_deleted=False).exclude(sender=user)
    if last_read:
        unread = unread.filter(created_at__gt=last_read)
    last = room.messages.select_related("sender").order_by("-id").first()
    other = None
    name = room.name
    if room.kind == RoomKind.DIRECT:
        other_m = room.memberships.select_related("user").exclude(user=user).first()
        if other_m:
            other = {"id": other_m.user_id, "full_name": other_m.user.full_name, "role": other_m.user.role}
            name = other_m.user.full_name
    return {
        "id": room.pk,
        "kind": room.kind,
        "name": name,
        "group": room.group_id,
        "other_user": other,
        "unread_count": unread.count(),
        "last_message": (
            {
                "body": "" if last.is_deleted else last.body[:120],
                "sender_name": last.sender.full_name,
                "created_at": last.created_at,
            }
            if last
            else None
        ),
        "last_message_at": room.last_message_at,
    }


class ChatViewSet(viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    role_permissions = {
        "rooms": ALL_ROLES,
        "direct": ALL_ROLES,
        "group_room": ALL_ROLES,
        "messages": ALL_ROLES,
        "read": ALL_ROLES,
        "contacts": ALL_ROLES,
        "delete_message": ALL_ROLES,
    }
    serializer_class = MessageSerializer
    pagination_class = None

    def get_queryset(self):
        return services.rooms_for(self.request.user)

    def get_throttles(self):
        if self.action == "messages" and self.request.method == "POST":
            return [ChatMessageThrottle()]
        return super().get_throttles()

    def _room(self, room_id) -> ChatRoom:
        room = get_object_or_404(ChatRoom.objects.select_related("group"), pk=room_id)
        if not services.can_access(self.request.user, room):
            raise PermissionDenied("Bu chatga kirishga ruxsat yo'q.")
        return room

    @extend_schema(responses={200: OpenApiResponse(description="My chat rooms")})
    @action(detail=False, methods=["get"])
    def rooms(self, request):
        rooms = services.rooms_for(request.user).order_by("-last_message_at", "-id")
        return Response([room_payload(r, request.user) for r in rooms])

    @extend_schema(request=DirectSerializer, responses={200: OpenApiResponse(description="Room")})
    @action(detail=False, methods=["post"], url_path="rooms/direct")
    def direct(self, request):
        serializer = DirectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        other = User.objects.filter(pk=serializer.validated_data["user_id"], is_active=True).first()
        if other is None or other.pk == request.user.pk:
            raise ValidationError({"user_id": ["Foydalanuvchi topilmadi."]})
        require(services.can_message(request.user, other), "Bu foydalanuvchiga yozishga ruxsat yo'q.")
        room = services.direct_room(request.user, other)
        return Response(room_payload(room, request.user))

    @extend_schema(responses={200: OpenApiResponse(description="Room")})
    @action(detail=False, methods=["get"], url_path=r"rooms/group/(?P<group_id>\d+)")
    def group_room(self, request, group_id=None):
        group = get_object_or_404(services.chat_groups_for(request.user), pk=group_id)
        room = services.group_room(group)
        ChatMembership.objects.get_or_create(room=room, user=request.user)
        return Response(room_payload(room, request.user))

    @extend_schema(request=SendSerializer, responses={200: MessageSerializer(many=True)})
    @action(detail=False, methods=["get", "post"], url_path=r"rooms/(?P<room_id>\d+)/messages")
    def messages(self, request, room_id=None):
        room = self._room(room_id)
        if request.method == "POST":
            serializer = SendSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            body = serializer.validated_data["body"].strip()
            if not body:
                raise ValidationError({"body": ["Xabar bo'sh bo'lmasin."]})
            msg = ChatMessage.objects.create(room=room, sender=request.user, body=body)
            ChatRoom.objects.filter(pk=room.pk).update(last_message_at=msg.created_at)
            ChatMembership.objects.update_or_create(
                room=room, user=request.user, defaults={"last_read_at": msg.created_at}
            )
            return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)
        qs = room.messages.select_related("sender")
        after_id = request.query_params.get("after_id")
        before_id = request.query_params.get("before_id")
        if after_id and after_id.isdigit():
            msgs = list(qs.filter(id__gt=int(after_id)).order_by("id")[:PAGE])
        else:
            if before_id and before_id.isdigit():
                qs = qs.filter(id__lt=int(before_id))
            msgs = list(qs.order_by("-id")[:PAGE])[::-1]
        return Response(MessageSerializer(msgs, many=True).data)

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["post"], url_path=r"rooms/(?P<room_id>\d+)/read")
    def read(self, request, room_id=None):
        room = self._room(room_id)
        ChatMembership.objects.update_or_create(room=room, user=request.user, defaults={"last_read_at": timezone.now()})
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={200: ContactSerializer(many=True)})
    @action(detail=False, methods=["get"])
    def contacts(self, request):
        qs = services.contacts_for(request.user)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(first_name__icontains=search) | Q(last_name__icontains=search))
        return Response(ContactSerializer(qs.order_by("role", "last_name")[:200], many=True).data)

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["delete"], url_path=r"messages/(?P<message_id>\d+)")
    def delete_message(self, request, message_id=None):
        msg = get_object_or_404(ChatMessage.objects.select_related("room", "room__group", "sender"), pk=message_id)
        self._room(msg.room_id)
        require(services.can_delete_message(request.user, msg), "Bu xabarni o'chirishga ruxsat yo'q.")
        if not msg.is_deleted:
            msg.is_deleted = True
            msg.save(update_fields=["is_deleted"])
            audit("chat_message_delete", actor=request.user, obj=msg, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)
