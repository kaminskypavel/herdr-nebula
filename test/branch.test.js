import test from "node:test";
import assert from "node:assert/strict";
import { branchName, slug } from "../mods/nebula/lib/branch.js";

test("Fix login redirect becomes fix-login-redirect", () => {
  assert.equal(slug("Fix login redirect"), "fix-login-redirect");
  assert.equal(branchName("Fix login redirect"), "fix-login-redirect");
});

test("the name keeps the task's meaningful words (four at most), not its first ones", () => {
  assert.equal(slug("I want you to scan the monorepo packages and apps"), "scan-monorepo-packages-apps");
  assert.equal(slug("please add retry handling to the upload worker queue"), "add-retry-handling-upload");
  assert.equal(slug("can you make sure the login works on mobile"), "login-works-mobile");
  const long = slug("internationalization-infrastructure-modernization and more");
  assert.ok(long.length <= 40 && !long.endsWith("-"), long);
});

test("a Hebrew task gets a random two-word name", () => {
  assert.equal(slug("תקן את הלוגין"), "");
  const name = branchName("תקן את הלוגין", () => 0);
  assert.match(name, /^[a-z]+-[a-z]+$/);
  assert.notEqual(
    branchName("תקן את הלוגין", () => 0.99),
    name,
  );
});

test("an empty task gets a random two-word name", () => {
  assert.match(branchName("   "), /^[a-z]+-[a-z]+$/);
});

test("punctuation never leaves a leading, trailing or doubled dash", () => {
  assert.equal(slug("  ...Fix: the (login) bug!!  "), "fix-login-bug");
});

test("links in the task are left out of the name", () => {
  assert.equal(slug("take a look on this model https://huggingface.co/taobao-mnn/MNN-Pocket-0.3B is it multilingual"), "take-model-multilingual");
});
