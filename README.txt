Can Budget V1.7.7 — Final Amount Paid Fix

Fixes receipts that contain several "You Paid" lines.

Example Lawtons receipt:
- Item 1 You Paid: $12.53
- Item 2 You Paid: $12.42
- Final summary YOU PAID: $24.95

Can Budget now collects all explicit paid amounts and prefers the final summary
amount near the subtotal/total section, rather than taking the first item-level copay.

Expected Lawtons result:
Lawtons Drugs · $24.95 · Healthcare · 2026-07-17

All V1.7.6 merchant recognition, high-resolution OCR, date logic, category
suggestions, receipt photos, navigation, and learned merchant corrections remain.
