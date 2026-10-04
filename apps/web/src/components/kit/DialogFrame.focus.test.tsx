import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Button from "./Button";
import DropdownMenu from "./DropdownMenu";
import Modal from "./Modal";
import Drawer from "./Drawer";

function MenuDialog() {
 const [open, setOpen] = useState(false);
 const trigger = useRef<HTMLButtonElement>(null);
 return <><DropdownMenu label="More actions" trigger={<Button ref={trigger}>More actions</Button>}
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
