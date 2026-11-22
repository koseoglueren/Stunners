import assert from "node:assert/strict";
import { test } from "node:test";
import { allocate, computeSettlement, lootContribution, type Beneficiary } from "./settlement";
import { coinBeneficiaries, itemOwners, presentAt } from "./shares";
import { parseNoah } from "./format";

const eq = (...ids: string[]): Beneficiary[] => ids.map((userId) => ({ userId, weight: 1n }));
const H = 3_600_000;

test("allocate: remainder spread, parts add up", () => {
  const m = allocate(100n, eq("a", "b", "c"));
  assert.equal([...m.values()].reduce((x, y) => x + y, 0n), 100n);
  assert.deepEqual([...m.values()].sort(), [33n, 33n, 34n]);
});

test("allocate by weight", () => {
  const m = allocate(1000n, [
    { userId: "a", weight: 12n },
    { userId: "b", weight: 12n },
    { userId: "c", weight: 4n },
  ]);
  assert.equal(m.get("a"), 429n);
  assert.equal(m.get("b"), 428n);
  assert.equal(m.get("c"), 143n);
  assert.equal([...m.values()].reduce((x, y) => x + y, 0n), 1000n);
});

test("vault pays every member their share", () => {
  const r = computeSettlement(
    [
      { amount: 120_000_000n, holderId: "k", beneficiaries: eq("a", "b", "c", "d") },
      { amount: 80_000_000n, holderId: "k", beneficiaries: eq("a", "b", "c", "d") },
    ],
    "k",
  );
  assert.equal(r.total, 200_000_000n);
  assert.equal(r.perShare, 50_000_000n);
  assert.equal(r.transfers.length, 4);
  for (const t of r.transfers) {
    assert.equal(t.kind, "PAYOUT");
    assert.equal(t.fromId, "k");
    assert.equal(t.amount, 50_000_000n);
  }
});

test("sold item goes only to its owners", () => {
  const r = computeSettlement(
    [
      { amount: 90n, holderId: "k", beneficiaries: eq("a", "b", "c") },
      { amount: 50n, holderId: "k", beneficiaries: eq("a", "b") },
    ],
    "k",
  );
  const s = new Map(r.shares.map((x) => [x.userId, x.share]));
  assert.equal(s.get("a"), 55n);
  assert.equal(s.get("b"), 55n);
  assert.equal(s.get("c"), 30n);
  assert.equal(s.get("k"), 0n);
});

test("late joiner gets coin by time present, items only after joining", () => {
  const start = new Date(0);
  const session = {
    startAt: start,
    endAt: new Date(12 * H),
    members: [
      { userId: "a", joinedAt: null, leftAt: null },
      { userId: "b", joinedAt: null, leftAt: null },
      { userId: "c", joinedAt: new Date(8 * H), leftAt: null },
    ],
  };
  const bens = coinBeneficiaries(session);
  assert.deepEqual(bens.map((b) => b.weight), [720n, 720n, 240n]);
  const parts = allocate(700n, bens);
  assert.equal(parts.get("a"), 300n);
  assert.equal(parts.get("c"), 100n);
  assert.deepEqual(presentAt(session, new Date(3 * H)), ["a", "b"]);
  assert.deepEqual(presentAt(session, new Date(9 * H)), ["a", "b", "c"]);
  assert.deepEqual(itemOwners({ customOwners: true, droppedAt: new Date(H), owners: [{ userId: "c" }] }, session), ["c"]);
});

test("full-time team splits equally", () => {
  const session = { startAt: new Date(0), endAt: new Date(5 * H), members: ["a", "b"].map((userId) => ({ userId, joinedAt: null, leftAt: null })) };
  const parts = allocate(101n, coinBeneficiaries(session));
  assert.deepEqual([...parts.values()].sort(), [50n, 51n]);
});

test("loot contribution by status", () => {
  const base = { value: 10n, salePrice: null, holderId: "h", soldById: null, receiverId: null };
  assert.deepEqual(lootContribution({ ...base, status: "COIN" }), { amount: 10n, holderId: "h", kept: false });
  assert.equal(lootContribution({ ...base, status: "IN_STOCK" }), null);
  assert.deepEqual(lootContribution({ ...base, status: "SOLD", salePrice: 30n, soldById: "s" }), { amount: 30n, holderId: "s", kept: false });
});

test("parseNoah understands shorthand", () => {
  assert.equal(parseNoah("150m"), 150_000_000n);
  assert.equal(parseNoah("1,5b"), 1_500_000_000n);
  assert.equal(parseNoah("250k"), 250_000n);
  assert.equal(parseNoah("150.000.000"), 150_000_000n);
  assert.equal(parseNoah("abc"), null);
});

test("sessionEarnings splits coin by minutes and sold items among owners present at drop", async () => {
  const { sessionEarnings } = await import("./earnings");
  const t = (h: number) => new Date(Date.UTC(2026, 10, 22, h));
  const base = { holderId: "a", soldById: null, receiverId: null, customOwners: false, salePrice: null };
  const r = sessionEarnings({
    startAt: t(10),
    endAt: t(12),
    members: [
      { userId: "a", joinedAt: null, leftAt: null },
      { userId: "b", joinedAt: t(11), leftAt: null },
    ],
    loot: [
      { ...base, status: "COIN" as const, value: 300n, droppedAt: t(12) },
      { ...base, status: "SOLD" as const, value: 0n, salePrice: 100n, droppedAt: t(10) },
      { ...base, status: "IN_STOCK" as const, value: 999n, droppedAt: t(11) },
    ],
  });
  assert.equal(r.total, 400n);
  assert.equal(r.perMember.get("a"), 300n);
  assert.equal(r.perMember.get("b"), 100n);
});
