Can Budget V1.7.4 — High Accuracy Receipt OCR

The July 15/16 error was traced to OCR image preparation, not the date parser:
the previous build reduced a tall receipt photo to 1600px before OCR, making
small printed digits easier to confuse.

Changes:
- OCR working image increased from max 1600px to max 3200px.
- OCR image quality increased.
- Light grayscale/contrast preprocessing added for thermal receipt text.
- Date consensus from V1.7.3 retained.
- Walmart merchant correction, total detection, category suggestion, receipt
  storage, navigation, and Add sheet retained.

The original receipt photo storage path is unchanged.
