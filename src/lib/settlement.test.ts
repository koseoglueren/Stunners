import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSettlement, lootContribution } from "./settlement";
import { parseNoah } from "./format";

test("equal split with transfers that settle everyone", () => {
  const r = computeSettlement(
    ["a", "b", "c", "d"],
    [
      { amount: 120_000_000n, holderId: "a" },
      { amount: 80_000_000n, holderId: "b" },
    ],
  );
  assert.equal(r.total, 200_000_000n);
  assert.equal(r.perShare, 50_000_000n);
  const final = new Map(r.shares.map((s) => [s.userId, s.held]));
  for (const t of r.transfers) {
    final.set(t.fromId, final.get(t.fromId)! - t.amount);
    final.set(t.toId, final.get(t.toId)! + t.amount);
  }
  for (const s of r.shares) assert.equal(final.get(s.userId), s.share);
  assert.ok(r.transfers.length <= 3);
});

test("remainder is spread so shares sum to total", () => {
  const r = computeSettlement(["a", "b", "c"], [{ amount: 100n, holderId: "a" }]);
  assert.equal(r.shares.reduce((x, s) => x + s.share, 0n), 100n);
  assert.equal(r.remainder, 1n);
});

test("given item counts as received by the receiver", () => {
  const c = lootContribution({ status: "GIVEN", value: 30n, salePrice: null, holderId: "a", soldById: null, receiverId: "b" });
  assert.deepEqual(c, { amount: 30n, holderId: "b" });
  assert.equal(lootContribution({ status: "IN_STOCK", value: 30n, salePrice: null, holderId: "a", soldById: null, receiverId: null }), null);
});

test("seller outside the team owes everything", () => {
  const r = computeSettlement(["a", "b"], [{ amount: 10n, holderId: "x" }]);
  assert.deepEqual(r.transfers.map((t) => t.fromId), ["x", "x"]);
});

test("parseNoah", () => {
  assert.equal(parseNoah("150m"), 150_000_000n);
  assert.equal(parseNoah("1,5b"), 1_500_000_000n);
  assert.equal(parseNoah("1.000.000"), 1_000_000n);
  assert.equal(parseNoah("250K"), 250_000n);
  assert.equal(parseNoah("abc"), null);
});
