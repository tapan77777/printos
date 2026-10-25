import {createElement} from "react";
import {act,create} from "react-test-renderer";
import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({signup:vi.fn(),signin:vi.fn(),recovery:vi.fn()}));
vi.mock("@/lib/auth-client",()=>({accountClient:{signUp:{email:m.signup},signIn:{email:m.signin},requestPasswordReset:m.recovery}}));
vi.mock("next/link",()=>({default:({children,...props}:any)=>createElement("a",props,children)}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn(),replace:vi.fn()})}));
import {AccountForm} from "../app/components/AccountForm";
beforeEach(()=>vi.clearAllMocks());
it("registration confirms email instructions, never fake verification or device pairing",async()=>{
 m.signup.mockResolvedValue({data:{},error:null});const view=create(createElement(AccountForm,{mode:"register"}));
 await act(async()=>{view.root.findByProps({autoComplete:"name"}).props.onChange({target:{value:"Fixture Owner"}});view.root.findByProps({autoComplete:"email"}).props.onChange({target:{value:"fixture@example.test"}});view.root.findByProps({autoComplete:"new-password"}).props.onChange({target:{value:"fixture-password"}});});
 await act(async()=>view.root.findByType("form").props.onSubmit({preventDefault(){}}));expect(m.signup).toHaveBeenCalledOnce();expect(JSON.stringify(view.toJSON())).toContain("verification email");expect(JSON.stringify(view.toJSON())).not.toContain("Device paired");view.unmount();
});
it("account UI recovers from network failure without retrying submission",async()=>{
 m.signin.mockRejectedValue(Error("Network unavailable"));const view=create(createElement(AccountForm,{mode:"login"}));await act(async()=>view.root.findByType("form").props.onSubmit({preventDefault(){}}));expect(m.signin).toHaveBeenCalledOnce();expect(view.root.findByType("button").props.disabled).toBe(false);expect(JSON.stringify(view.toJSON())).toContain("Network unavailable");view.unmount();
});
