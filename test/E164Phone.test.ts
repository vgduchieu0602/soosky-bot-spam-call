import assert from "node:assert/strict";
import test from "node:test";
import E164Phone, { InvalidE164PhoneError } from "../src/domain/value-objects/E164Phone";

test("normalizes supported US phone formats to E.164", () => {
    assert.equal(E164Phone.fromUs("202-555-0111").value, "+12025550111");
    assert.equal(E164Phone.fromUs("1 (202) 555 0111").value, "+12025550111");
    assert.equal(E164Phone.fromUs("+1 202 555 0111").value, "+12025550111");
});

test("rejects missing, malformed, and non-NANP values", () => {
    for (const input of ["", "not-a-number", "1202555011", "1025550111", "+2025550111", "+442071838750"]) {
        assert.throws(() => E164Phone.fromUs(input), InvalidE164PhoneError);
    }
});
