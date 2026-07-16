# Theme control — change the whole system from one place

**You never write a colour inside a page.** Every colour is a variable ("token")
declared once in `tokens/colors.css`. Change the token → every screen updates at
once. That's the whole point: consistency you can't accidentally break.

## The levers you'll actually touch

```css
/* tokens/colors.css → :root */
--flame:       #C44D2B;   /* THE theme colour. Buttons, active nav, checkbox, focus ring. Change this = rebrand. */
--flame-dark:  #9A3D22;   /* its hover shade (pick ~15% darker than --flame) */
--flame-light: #F4E4DD;   /* its soft fill for active nav/chips (pick a very pale tint of --flame) */

--canvas:      #F5F5F7;   /* the page background behind the white panels */
--surface:     #FFFFFF;   /* the white cards/panels */
--text-primary:#1A1A1A;   /* body text you READ — keep it near-black */
--text-muted:  #A8A8A8;   /* labels/meta only */

--ready-fill:  #EAF3DE;  --ready-ink:  #3B6D11;   /* green status pill */
--waiting-fill:#FAEEDA;  --waiting-ink:#854F0B;   /* amber status pill */
--overdue-fill:#FCEBEB;  --overdue-ink:#A32D2D;   /* red status pill */
```

## How to change the theme colour (example)

Want a teal brand instead of flame? Edit **three** lines only:

```css
--flame:       #0E7C7B;   /* new brand */
--flame-dark:  #0A605F;   /* darker for hover */
--flame-light: #DDEDEC;   /* pale tint for active fills */
```

Save. Every button, nav highlight, checkbox and focus ring across all pages turns
teal. No page edits.

## The rounding / spacing levers (`tokens/layout.css`)

```css
--radius-panel: 18px;   /* big rounded surface panels (unified 18) */
--radius-card:  12px;   /* standard cards */
--radius-btn:    8px;   /* buttons */
--row-h:        44px;   /* list row height — 44 compact, 52 for a roomier feel */
```

## The rule to give Claude Code

> "All colours come from `tokens/colors.css` variables — never write a hex in a
> page. To change the theme, edit `--flame` (+ its `-dark`/`-light`) in that one
> file. Keep content text near-black; muted grey is for labels only."
