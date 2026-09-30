import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Button from "./Button";
import DropdownMenu from "./DropdownMenu";
import Modal from "./Modal";

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
