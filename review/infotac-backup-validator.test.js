"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validate } = require("./infotac-backup-validator");
const E = "11111111-1111-4111-8111-111111111111", X = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333", U = "44444444-4444-4444-8444-444444444444";
const O = "55555555-5555-4555-8555-555555555555", I = "66666666-6666-4666-8666-666666666666";
const P = "77777777-7777-4777-8777-777777777777", A = "88888888-8888-4888-8888-888888888888";
function sample() { return { kind: "infotac-restore-existing-v1", schema_version: 1, empresa_id: E,
  empresa: { id: E, nombre: "Ficticia" }, clientes: [{ id: C, empresa_id: E }],
  usuarios: [{ id: U, empresa_id: E, rol: "admin" }],
  ordenes: [{ id: O, empresa_id: E, cliente_id: C, tecnico_id: U, pass: "clave ficticia" }],
  orden_items: [{ id: I, empresa_id: E, orden_id: O }], pagos: [{ id: P, empresa_id: E, orden_id: O }],
  orden_audit: [{ id: A, empresa_id: E, orden_id: O, actor_id: U }] }; }
function fails(change) { const data = sample(); change(data); assert.throws(() => validate(data, E)); }
test("valid; no mutation", () => { const data = sample(), before = structuredClone(data);
  assert.equal(validate(data, E, new Set([U])), true); assert.deepEqual(data, before); });
test("wrong company in session", () => assert.throws(() => validate(sample(), X)));
test("unexpected top level field", () => fails(p => p.unexpected = true));
test("unknown user in target", () => assert.throws(() => validate(sample(), E, new Set())));
test("invalid target users", () => assert.throws(() => validate(sample(), E, [])));
test("empty orders with audit", () => fails(p => p.ordenes = []));
for (const name of ["clientes", "usuarios", "ordenes", "orden_items", "pagos", "orden_audit"]) {
  test("wrong company: " + name, () => fails(p => p[name][0].empresa_id = X));
  test("duplicate: " + name, () => fails(p => p[name].push({...p[name][0]})));
  test("missing: " + name, () => fails(p => delete p[name]));
  test("extra field: " + name, () => fails(p => p[name][0].password_hash = "fake"));
}
test("access code excluded", () => fails(p => p.empresa.codigo_acceso = "fake"));
test("missing customer", () => fails(p => p.ordenes[0].cliente_id = X));
test("missing technician", () => fails(p => p.ordenes[0].tecnico_id = X));
for (const name of ["orden_items", "pagos", "orden_audit"]) {
  test("dangling order: " + name, () => fails(p => p[name][0].orden_id = X));
  test("null order: " + name, () => fails(p => p[name][0].orden_id = null));
}
test("missing audit actor", () => fails(p => p.orden_audit[0].actor_id = X));
test("oversized package", () => fails(p => p.empresa.nombre = "x".repeat(15*1024*1024)));
