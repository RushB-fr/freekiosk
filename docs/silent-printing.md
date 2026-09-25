

# FreeKiosk Silent Printing

**Silent printing from a web page to an ESC/POS printer, with no print dialog**

<p>
  <a href="README.md">Docs Home</a> •
  <a href="features-and-modes.md">Features & Modes</a> •
  <a href="faq.md">FAQ</a>
</p>


> [!IMPORTANT]
> Android's print framework always shows the system print dialog, print services included. An
> unattended kiosk has nobody to tap it, which is why FreeKiosk drives the printer itself.


## Table of Contents

- [What You Need](#what-you-need)
- [Setup](#setup)
- [Printing From a Web Page](#printing-from-a-web-page)
- [The JavaScript API](#the-javascript-api)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)


## What You Need

- A USB printer that speaks **ESC/POS**, the most common POS printer command set. Printers that
  speak only a label language such as ZPL or TSPL are not supported.
- A USB-C adapter with a **power passthrough** port, so the tablet charges while the printer is
  attached.

Printers are matched by the **USB Printer Class**, not by a list of models, so unfamiliar hardware
generally works. A printer exposing only a vendor-specific interface still prints, but cannot report
its paper level; add it to `android/app/src/main/res/xml/usb_printer_filter.xml` by vendor and
product id if Android does not offer FreeKiosk when it is plugged in.

> [!NOTE]
> **Verified hardware.** Printing has been confirmed end to end on an **Xprinter C58H** (58mm),
> attached to an **HONOR Pad X8b LTE** running **Android 16**, printing a web page through its own
> print stylesheet at the default width of **384 dots**. No model-specific code or filter entry was
> needed. Paper-level reporting was not confirmed on that model — see
> [Limitations](#limitations).


## Setup

1. Plug the printer into the adapter and switch it on.
2. Android asks which app should open the device. Choose **FreeKiosk** and tick **Always open**.
3. Go to **Settings > General > Printing**.
4. Under **Silent Printing**, turn on **Enable Silent Printing**. It does not need
   **Enable Window Printing**, which only controls `window.print()`.
5. Check the status card names your printer, then tap **Print test page**.

> [!WARNING]
> Do step 2 **before** enabling Lock Mode. Android suppresses that dialog in lock task, and the
> **Grant access** button in Settings only lasts until the printer is next unplugged. Only the
> "Always open" choice survives a reboot, or the re-enumeration a powered USB-C adapter causes when
> its power is plugged or unplugged.

The test page shows a column ruler, currency and accented characters, a grey ramp and hairlines. If
the ruler wraps or leaves a wide margin, the **Print width** is wrong.

Width is set in **dots**, the printable width listed in the printer's specification. Dots are what
the printer actually addresses, so no paper size or resolution is assumed anywhere.


## Printing From a Web Page

Call `window.FreeKiosk.silentPrinter.print()`. The page's own print stylesheet is what lands on paper,
including its fonts, its language and any QR codes.

`window.print()` is separate and unchanged: with **Enable Window Printing** on it opens the Android
print dialog, and otherwise it does nothing. A page can use both, A4 through the dialog and receipts
through Silent Printing, but both render the same `@media print` stylesheet. Switch it to the receipt
layout before calling `silentPrinter.print()`, for example with a class on `<html>`, or render the receipt
yourself and call `printImage()`.

The page is laid out so that **one CSS pixel is one printer dot**, so design against the configured
width — 384px below:

```css
@page {
  size: 384px auto;   /* the configured dot width */
  margin: 0;
}

@media print {
  body { width: 384px; margin: 0; color: #000; background: #fff; }
  .no-print { display: none; }
}
```

Prefer `px` and percentages over `mm` or `pt`: a physical unit means whatever the browser thinks an
inch is, which has nothing to do with your printer. Keep the layout simple — black on white, no
background images, and text large enough to stay legible at one dot per pixel.

The page is already laid out at the configured width, so `width: 100%` and percentages work without
repeating the dot width in CSS — useful if the same page has to print on two different rolls.

Draw a QR code as **inline SVG** rather than as a PNG. It stays vector through the rendering step and
is turned into dots once, at the printer's own resolution, instead of being scaled from whatever
pixel size the page chose.


## The JavaScript API

`window.FreeKiosk.silentPrinter` is injected when **Enable Silent Printing** is on. Every call returns a promise, so
a page knows whether a print went through, and `getStatus()` lets it check for paper before it promises
a ticket.

```js
window.addEventListener('freekiosk:ready', async () => {
  const { state, paper, printer } = await window.FreeKiosk.silentPrinter.getStatus();
  if (state !== 'ready') return;

  await window.FreeKiosk.silentPrinter.print('Test print');
});
```

Injection happens after the page loads, so check for `window.FreeKiosk` at the moment you print, or
wait for the `freekiosk:ready` event.

| Method | Description |
|--------|-------------|
| `getStatus()` | Resolves with `{ state, paper, printer }` |
| `print(jobName?)` | Renders the page through its print stylesheet and prints the result, with no dialog |
| `printImage(base64)` | Prints a PNG or JPEG, with or without a `data:` prefix |

`print` lays the page out again for print when it is called, so its `@media print` rendering is what
lands on paper, not what is on screen — a DOM change made just before the call is printed. `jobName`
only names the job and is never printed; it defaults to the document title.

`print` and `printImage` resolve `true` once the printer has accepted every byte.

`printImage` decodes at print resolution rather than the image's own, so a photo straight from a
camera costs no more memory than a receipt does. It rejects with `BAD_IMAGE` a payload over 8MB,
and an image whose pixel dimensions are too large to decode safely even after that downsampling.

`state` is one of `ready`, `no_printer`, `no_permission`, `paper_out` or `error`. `paper` is `ok`,
`out` or `unknown`. `unknown` means the paper state could not be read, and does not block printing.
A printer with no paper sensor usually reports `ok`, so `ok` does not guarantee paper.

Rejections carry a `code`: `NO_PRINTER`, `NO_PERMISSION`, `PAPER_OUT`, `OPEN_FAILED`, `WRITE_FAILED`,
`BAD_IMAGE`, `PAGE_RENDER_FAILED`, `NO_WEBVIEW`, `ORIGIN_NOT_ALLOWED`, or `ERROR` for anything
unexpected.

**Restrict printing by origin** in Settings limits `window.FreeKiosk.silentPrinter`, `getStatus()` included,
to the origins you list. Only the scheme, host and port of each entry are compared. Turned on with
nothing listed, no page can print. Turned off, any page the kiosk displays may print. It does not
cover `window.print()`, whose dialog needs someone to confirm it anyway.

An iframe never prints, allow-list or not. `window.FreeKiosk` is injected into the main frame only,
and a printer request that does not come from it is dropped.


## Troubleshooting

| Symptom | Cause |
|---------|-------|
| Status shows **No printer detected** | Cable, adapter or printer power. Check the adapter carries data, not only power |
| Status shows **Access not granted** | Tap **Grant access**. If the printer was already plugged in when FreeKiosk was installed, Android never offered the "Always open" choice — unplug and replug it once to get that prompt |
| Ruler wraps, or leaves a wide margin | Wrong **Print width**. Check the dot width in the printer's specification |
| Nothing prints, no error | Printer is out of paper but has no sensor. Check the roll |
| A long blank strip after each print | Reduce **Feed after printing** |
| `PAGE_RENDER_FAILED` | The page could not be rendered. Have the page render its own bitmap and call `printImage` instead |


## Limitations

- USB only. Bluetooth and network printers are not supported yet.
- The command set is ESC/POS. Label languages (ZPL, TSPL, EPL) and Star's own graphics mode are not
  implemented.
- Paper level is reported only by printers implementing the USB Printer Class status request, and
  has not yet been confirmed on a printer that does. `getStatus()` answers `paper: 'unknown'` where
  it cannot be read, which does not block printing.
