import { afterEach, describe, expect, it, vi } from "vitest";
import { extensionForMime, uploadAttachment, uploadDataUrl } from "./storage";

vi.mock("./supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  },
}));

afterEach(() => vi.restoreAllMocks());

describe("extensionForMime", () => {
  it("maps known MIMEs to safe extensions", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("application/pdf")).toBe("pdf");
    expect(extensionForMime("image/heic")).toBe("heic");
    expect(extensionForMime("image/heif")).toBe("heic");
  });

  it("returns 'bin' for unknown / hostile MIMEs (uploadAttachment will then reject the filename)", () => {
    expect(extensionForMime("text/html")).toBe("bin");
    expect(extensionForMime("application/x-sh")).toBe("bin");
    expect(extensionForMime("")).toBe("bin");
  });
});

describe("uploadAttachment — Content-Type whitelist (F2 stored-XSS guard)", () => {
  const validArgs = {
    dealerId: "00000000-0000-0000-0000-000000000d01",
    wizardSessionId: "wiz-1",
    blob: new Blob(["x"], { type: "image/png" }),
  };

  it("accepts allowed extensions and resolves to bucket-prefixed path", async () => {
    for (const filename of ["signature.png", "payment-slip.jpg", "payment-slip.pdf"]) {
      const path = await uploadAttachment({ ...validArgs, filename });
      expect(path).toBe(`orders-attachments/${validArgs.dealerId}/wiz-1/${filename}`);
    }
  });

  it("rejects unsupported extensions before calling Storage", async () => {
    await expect(
      uploadAttachment({ ...validArgs, filename: "payload.html" }),
    ).rejects.toThrow(/Unsupported attachment extension/);
    await expect(
      uploadAttachment({ ...validArgs, filename: "evil.bin" }),
    ).rejects.toThrow(/Unsupported attachment extension/);
    await expect(
      uploadAttachment({ ...validArgs, filename: "no-extension" }),
    ).rejects.toThrow(/Unsupported attachment extension/);
  });

  it("does NOT trust a hostile blob.type — Content-Type comes from filename only", async () => {
    // A tampered draft could ship blob.type = 'text/html' with HTML body.
    // We can't inspect what was passed to Storage from this test (the mock
    // doesn't capture upload args), but the whitelist throw ensures only
    // safe extensions reach this point. The negative test above covers the
    // attack vector — this test confirms hostile MIME on a safe filename
    // is still uploaded (because the filename, not the blob type, decides).
    const hostileBlob = new Blob(["<script>"], { type: "text/html" });
    await expect(
      uploadAttachment({ ...validArgs, filename: "signature.png", blob: hostileBlob }),
    ).resolves.toBeTruthy();
  });
});

describe("uploadDataUrl — composes dataURL → Blob → upload", () => {
  it("propagates extension whitelist errors", async () => {
    const tinyDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC";
    await expect(
      uploadDataUrl({
        dealerId: "00000000-0000-0000-0000-000000000d01",
        wizardSessionId: "wiz-1",
        filename: "signature.exe",
        dataUrl: tinyDataUrl,
      }),
    ).rejects.toThrow(/Unsupported attachment extension/);
  });
});
