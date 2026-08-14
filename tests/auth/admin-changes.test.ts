import { describe, expect, it } from "vitest";
import { refuseActiveChange, refuseRoleChange } from "@/lib/auth/admin-changes";

const ACTOR = "11111111-1111-1111-1111-111111111111";
const TARGET = "22222222-2222-2222-2222-222222222222";

describe("role changes", () => {
  it("allows promoting a customer", () => {
    expect(
      refuseRoleChange({
        actorId: ACTOR,
        targetId: TARGET,
        nextRole: "admin",
        targetIsAdmin: false,
        activeAdminCount: 1,
      }),
    ).toBeNull();
  });

  it("allows demoting an admin while another remains", () => {
    expect(
      refuseRoleChange({
        actorId: ACTOR,
        targetId: TARGET,
        nextRole: "customer",
        targetIsAdmin: true,
        activeAdminCount: 2,
      }),
    ).toBeNull();
  });

  it("refuses changing your own role", () => {
    // The page needed to undo it is the one the change removes.
    expect(
      refuseRoleChange({
        actorId: ACTOR,
        targetId: ACTOR,
        nextRole: "customer",
        targetIsAdmin: true,
        activeAdminCount: 5,
      }),
    ).toBe("self");
  });

  it("refuses demoting the last administrator", () => {
    expect(
      refuseRoleChange({
        actorId: ACTOR,
        targetId: TARGET,
        nextRole: "customer",
        targetIsAdmin: true,
        activeAdminCount: 1,
      }),
    ).toBe("last_admin");
  });

  it("refuses a role it does not recognise", () => {
    expect(
      refuseRoleChange({
        actorId: ACTOR,
        targetId: TARGET,
        nextRole: "superuser",
        targetIsAdmin: false,
        activeAdminCount: 2,
      }),
    ).toBe("unknown_role");
  });
});

describe("suspension", () => {
  it("allows suspending a customer", () => {
    expect(
      refuseActiveChange({
        actorId: ACTOR,
        targetId: TARGET,
        nextActive: false,
        targetIsAdmin: false,
        activeAdminCount: 1,
      }),
    ).toBeNull();
  });

  it("allows reactivating anyone, including the last admin", () => {
    expect(
      refuseActiveChange({
        actorId: ACTOR,
        targetId: TARGET,
        nextActive: true,
        targetIsAdmin: true,
        activeAdminCount: 1,
      }),
    ).toBeNull();
  });

  it("refuses suspending yourself", () => {
    expect(
      refuseActiveChange({
        actorId: ACTOR,
        targetId: ACTOR,
        nextActive: false,
        targetIsAdmin: true,
        activeAdminCount: 3,
      }),
    ).toBe("self");
  });

  it("refuses suspending the last administrator", () => {
    // Locks the store as surely as demoting them.
    expect(
      refuseActiveChange({
        actorId: ACTOR,
        targetId: TARGET,
        nextActive: false,
        targetIsAdmin: true,
        activeAdminCount: 1,
      }),
    ).toBe("last_admin");
  });
});
