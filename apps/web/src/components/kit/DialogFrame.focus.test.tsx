import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Button from "./Button";
import { CMenu } from "@/components/carres/CPopover";
import Modal from "./Modal";
import Drawer, { ContextualPanelSurface } from "./Drawer";
import Select from "./Select";
import { ShellHeaderContext } from "@/pages/operation/components/shell-header-context";

function MenuDialog() {
 const [open, setOpen] = useState(false);
 const trigger = useRef<HTMLButtonElement>(null);
 return <><CMenu label="More actions" trigger={<Button ref={trigger}>More actions</Button>}
  items={[{key:"assign", label:"Assign", onSelect:()=>{trigger.current?.focus(); setOpen(true);}}]} />
  <Modal returnFocusRef={trigger} open={open} onOpenChange={setOpen} title="Assign" footer={<Button onClick={()=>setOpen(false)}>Cancel</Button>}><input aria-label="Reason" /></Modal></>;
}
describe("dialog focus from a menu", () => {
 it("returns focus to the persistent action trigger, not an unmounted menu item or dialog control", async () => {
  render(<MenuDialog />);
  const trigger = screen.getByRole("button",{name:"More actions"});
  trigger.focus(); fireEvent.keyDown(trigger,{key:"ArrowDown"});
  fireEvent.click(await screen.findByRole("menuitem",{name:"Assign"}));
  expect(await screen.findByRole("dialog",{name:"Assign"})).toBeVisible();
  screen.getByRole("textbox",{name:"Reason"}).focus();
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
  await waitFor(()=>expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).toBeNull();
 });
});

function CompactDrawer() {
 const [open, setOpen] = useState(false);
 return <><Button onClick={()=>setOpen(true)}>View order</Button>
 <Drawer open={open} onOpenChange={setOpen} title="SO-1368" variant="compact-card">
  <button onClick={()=>setOpen(false)}>Close panel</button>
 </Drawer></>;
}
describe("compact card focus", () => {
 it("focuses its visible control without a hidden duplicate Close and returns to the opener", async () => {
  render(<CompactDrawer />);
  const opener = screen.getByRole("button", {name:"View order"});
  opener.focus(); fireEvent.click(opener);
  expect(await screen.findByRole("dialog", {name:"SO-1368"})).toBeVisible();
  expect(screen.queryByRole("button", {name:"Close"})).toBeNull();
  await waitFor(()=>expect(screen.getByRole("button", {name:"Close panel"})).toHaveFocus());
  fireEvent.keyDown(screen.getByRole("button", {name:"Close panel"}), {key:"Escape"});
  await waitFor(()=>expect(opener).toHaveFocus());
  expect(screen.queryByRole("dialog")).toBeNull();
 });
});

function TaskReview() {
 const [open, setOpen] = useState(false);
 const [saving, setSaving] = useState(false);
 return <><Button onClick={()=>setOpen(true)}>Review task</Button>
 <Modal open={open} onOpenChange={setOpen} title="TEST task review" variant="task-review">
  <input aria-label="TEST draft" />
  <Button onClick={()=>setSaving(true)} disabled={saving}>Save</Button>
  <Button onClick={()=>setOpen(false)} disabled={saving}>Cancel</Button>
 </Modal></>;
}
describe("task-wide review focus and dismissal", () => {
 it("moves focus into the existing full surface, protects its draft from Escape, and returns through the owning Cancel", async () => {
  render(<TaskReview />);
  const opener = screen.getByRole("button", {name:"Review task"});
  opener.focus(); fireEvent.click(opener);
  const dialog = await screen.findByRole("dialog", {name:"TEST task review"});
  const draft = screen.getByRole("textbox", {name:"TEST draft"});
  await waitFor(()=>expect(draft).toHaveFocus());
  expect(screen.queryByRole("button", {name:"Review task"})).toBeNull();
  expect(screen.queryByRole("button", {name:"Close"})).toBeNull();
  fireEvent.change(draft, {target:{value:"TEST retained draft"}});
  fireEvent.keyDown(draft, {key:"Escape"});
  expect(dialog).toBeVisible(); expect(draft).toHaveValue("TEST retained draft");
  opener.focus(); expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.click(screen.getByRole("button", {name:"Cancel"}));
  await waitFor(()=>expect(opener).toHaveFocus());
 });
 it("does not introduce an Escape or extra Close bypass while the owning form is submitting, and cleans up on unmount", async () => {
  const mounted = render(<TaskReview />);
  const opener = screen.getByRole("button", {name:"Review task"});
  opener.focus(); fireEvent.click(opener);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", {name:"Save"}));
  expect(screen.getByRole("button", {name:"Cancel"})).toBeDisabled();
  fireEvent.keyDown(dialog, {key:"Escape"});
  expect(dialog).toBeVisible(); expect(screen.queryByRole("button", {name:"Close"})).toBeNull();
  mounted.unmount();
  await waitFor(()=>expect(document.body).not.toHaveAttribute("data-scroll-locked"));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
 });
});

function ResponsivePanel() {
 const [open, setOpen] = useState(false);
 return <><Button onClick={() => setOpen(true)}>Open summary</Button>{open && <ContextualPanelSurface panel="Summary" onHide={() => setOpen(false)}><input aria-label="Retained panel input" defaultValue="TEST" /><Select id="retained-select" label="TEST panel choice" value="one" options={[{ value: "one", label: "TEST One" }, { value: "two", label: "TEST Two" }]} onValueChange={() => {}} /><Button onClick={() => setOpen(false)}>Hide summary</Button></ContextualPanelSurface>}</>;
}
it("retains the same input and scroll host when a docked panel becomes an overlay and back", async () => {
 const originalWidth = window.innerWidth;
 Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
 const mounted = render(<ShellHeaderContext.Provider value={{ el: null, claim: () => () => {} }}><ResponsivePanel /></ShellHeaderContext.Provider>);
 const opener = screen.getByRole("button", { name: "Open summary" });
 opener.focus(); fireEvent.click(opener);
 const input = screen.getByRole("textbox", { name: "Retained panel input" });
 fireEvent.change(input, { target: { value: "TEST unsaved" } });
 const host = input.parentElement!; host.scrollTop = 42; input.focus();
 Object.defineProperty(window, "innerWidth", { configurable: true, value: 1025 });
 fireEvent(window, new Event("resize"));
 expect(await screen.findByRole("dialog", { name: "Summary" })).toContainElement(input);
 expect(input).toHaveValue("TEST unsaved"); expect(host.scrollTop).toBe(42);
 await waitFor(() => expect(input).toHaveFocus());
 fireEvent.click(screen.getByRole("combobox", { name: "TEST panel choice" }));
 const list = await screen.findByRole("listbox");
 expect(host).toContainElement(list);
 fireEvent.keyDown(list, { key: "Escape" });
 await waitFor(() => expect(screen.getByRole("combobox", { name: "TEST panel choice" })).toHaveFocus());
 input.focus();
 Object.defineProperty(window, "innerWidth", { configurable: true, value: 1164 });
 fireEvent(window, new Event("resize"));
 await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
 expect(screen.getByRole("textbox", { name: "Retained panel input" })).toBe(input);
 expect(input).toHaveValue("TEST unsaved"); expect(host.scrollTop).toBe(42);
 await new Promise((resolve) => setTimeout(resolve, 10));
 expect(input).toHaveFocus();
 mounted.unmount();
 Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
});
