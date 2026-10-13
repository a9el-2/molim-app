import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MOLIM_ID_PATTERN,
  isValidMolimId,
  nextMolimIdFromIds,
  MEMBER_ID_MAX_ATTEMPTS,
} from "../src/app/lib/member-id.ts";

test("توليد المعرّف: القائمة الفارغة تبدأ من MOL-00001", () => {
  assert.equal(nextMolimIdFromIds([]), "MOL-00001");
});

test("توليد المعرّف: يأخذ أعلى رقم موجود ويزيده واحدًا", () => {
  assert.equal(
    nextMolimIdFromIds(["MOL-00001", "MOL-00007", "MOL-00003"]),
    "MOL-00008"
  );
});

test("توليد المعرّف: يتجاهل القيم التي لا تطابق الصيغة والفارغة", () => {
  assert.equal(
    nextMolimIdFromIds([null, undefined, "", "ABC-1", "MOL-X", "MOL-00002"]),
    "MOL-00003"
  );
});

test("توليد المعرّف: يحافظ على الحشو لخمسة أرقام", () => {
  assert.equal(nextMolimIdFromIds(["MOL-00009"]), "MOL-00010");
  assert.equal(nextMolimIdFromIds(["MOL-00099"]), "MOL-00100");
  assert.equal(nextMolimIdFromIds(["MOL-99999"]), "MOL-100000");
});

test("نط الصيغة: يقبل MOL-متسلسلة ويرفض غيرها", () => {
  assert.equal(MOLIM_ID_PATTERN.test("MOL-00001"), true);
  assert.equal(MOLIM_ID_PATTERN.test("MOL-123"), true);
  assert.equal(MOLIM_ID_PATTERN.test("mol-00001"), false);
  assert.equal(MOLIM_ID_PATTERN.test("MOL-ABC"), false);
  assert.equal(MOLIM_ID_PATTERN.test("MOL00001"), false);
});

test("حد المحاولات معرّف بقيمة موجبة", () => {
  assert.ok(MEMBER_ID_MAX_ATTEMPTS >= 1);
});

test("التحقق من صحة المعرّف: يقبل MOL-XXXXX ويرفض غيرها", () => {
  assert.equal(isValidMolimId("MOL-00001"), true);
  assert.equal(isValidMolimId("MOL-100000"), true);
  assert.equal(isValidMolimId("mol-00001"), false);
  assert.equal(isValidMolimId("MOL-ABC"), false);
  assert.equal(isValidMolimId(""), false);
  assert.equal(isValidMolimId(null), false);
  assert.equal(isValidMolimId(undefined), false);
  assert.equal(isValidMolimId(123), false);
});
