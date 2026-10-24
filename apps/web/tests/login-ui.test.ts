import { createElement, type ReactNode } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "../app/login/LegacyLogin";
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) }));
afterEach(() => vi.unstubAllGlobals());
describe("owner sign-in presentation", () => {
  it("recovers from a network failure without retrying or changing the request contract", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Connection interrupted")); vi.stubGlobal("fetch", fetch);
    const view = create(createElement(LoginPage));
    await act(async () => { view.root.findByProps({ id: "owner-password" }).props.onChange({ target: { value: "test-password" } }); });
    await act(async () => { await view.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ body: '{"password":"test-password"}', method: "POST" }));
    expect(view.root.findByProps({ type: "submit" }).props.disabled).toBe(false);
    expect(JSON.stringify(view.toJSON())).toContain("Connection interrupted"); view.unmount();
  });
  it("keeps password visibility as a local UI choice", async () => {
    const view = create(createElement(LoginPage));
    await act(async () => { view.root.findByProps({ "aria-label": "Show password" }).props.onClick(); });
    expect(view.root.findByProps({ id: "owner-password" }).props.type).toBe("text");
    view.unmount();
  });
});
