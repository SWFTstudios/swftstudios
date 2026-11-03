# Listomania (Envato)

Self-hosted web faces from the Listomania Envato pack. **Registered in CSS but not applied to any site copy yet.**

## Layout

```
fonts/listomania/
  regular/   # upright .woff2 (One–Five, All Caps, Script, Spares, Underlines)
  oblique/   # matching oblique .woff2
```

Desktop formats from the Envato zip (OTF / TTF / WOFF) are not tracked here — only `.woff2` for the site.

## CSS

[`css/listomania.css`](../../css/listomania.css) declares `@font-face` rules and CSS variables such as `--swft-font-listomania-one`. Import is wired through [`css/swft-fonts.css`](../../css/swft-fonts.css). Browsers only download a face when something uses that `font-family`.
