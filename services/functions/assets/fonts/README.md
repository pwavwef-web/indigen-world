# Word card font

NotoSans-Regular.ttf is bundled for exact Kasem/English text rendering on daily word cards. It is licensed under the SIL Open Font License 1.1; see OFL.txt. The font is loaded explicitly by resvg, so Cloud Functions does not rely on an operating system font installation.

- Font source: https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf
- License copy: https://github.com/google/fonts/blob/main/ofl/notosans/OFL.txt
- Retrieved: 2026-10-02.

## Correspondence fonts

NotoSans-Bold.ttf, NotoSans-Italic.ttf and NotoSans-BoldItalic.ttf are bundled
with Regular for Heritage Frame letters and the portal preview. Source: the
same notofonts/noto-fonts repository, hinted/ttf/NotoSans, retrieved October 10,
2026. All four use the existing SIL OFL 1.1 licence in OFL.txt. PDF generation
embeds subsets; Word embeds all four faces. Never depend on fonts installed on
a Functions host, and verify Kasem glyphs when replacing these files.
