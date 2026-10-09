import { NAV } from "./nav";
import { router } from "./router";

function routePaths(): Set<string> {
  const paths = new Set<string>();
  const walk = (routes: typeof router.routes, prefix = "") => {
    for (const r of routes) {
      const path = r.index ? prefix || "/" : r.path ? (r.path.startsWith("/") ? r.path : `${prefix}/${r.path}`.replace("//", "/")) : prefix;
      if (r.index || r.path) paths.add(path);
      if (r.children) walk(r.children, r.path ? path : prefix);
    }
  };
  walk(router.routes);
  return paths;
}

const links = (role: keyof typeof NAV) => NAV[role].flatMap((s) => s.items.map((i) => i.to));

describe("role navigation", () => {
  it("only links to routes that exist", () => {
    const paths = routePaths();
    for (const role of Object.keys(NAV) as (keyof typeof NAV)[]) {
      for (const to of links(role)) expect(paths, `${role} → ${to}`).toContain(to);
    }
  });

  it("gives each role its own menu", () => {
    expect(links("superadmin")).toEqual(expect.arrayContaining(["/branches", "/admins", "/audit", "/settings"]));
    expect(links("admin")).not.toContain("/branches");
    expect(links("admin")).not.toContain("/audit");
    expect(links("teacher")).not.toEqual(expect.arrayContaining(["/payments"]));
    expect(links("teacher")).toContain("/grades");
    expect(links("student")).not.toEqual(expect.arrayContaining(["/students"]));
    expect(links("student")).not.toContain("/debtors");
    expect(links("student")).toContain("/payments");
  });

  it("never repeats a link inside one menu", () => {
    for (const role of Object.keys(NAV) as (keyof typeof NAV)[]) {
      const l = links(role);
      expect(new Set(l).size, role).toBe(l.length);
    }
  });
});
