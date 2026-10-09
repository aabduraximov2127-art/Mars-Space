from rest_framework.routers import SimpleRouter

from .views import BalanceViewSet, InvoiceViewSet, PaymentViewSet

router = SimpleRouter()
router.register("payments", PaymentViewSet, basename="payment")
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("balances", BalanceViewSet, basename="balance")

urlpatterns = router.urls
