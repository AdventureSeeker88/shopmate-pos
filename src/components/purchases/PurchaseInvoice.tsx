import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Printer, X } from "lucide-react";
import { Purchase } from "@/lib/offlinePurchaseService";
import { getShopSettings } from "@/lib/shopSettings";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: Purchase | null;
}

const PurchaseInvoice = ({ open, onOpenChange, purchase }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const shop = getShopSettings();

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Purchase Invoice</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #111; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
        .shop-name { font-size: 24px; font-weight: 800; letter-spacing: 1px; }
        .shop-detail { font-size: 12px; color: #555; margin-top: 2px; }
        .invoice-title { font-size: 16px; font-weight: 700; margin-top: 8px; text-transform: uppercase; letter-spacing: 2px; }
        .meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 14px; }
        .meta div { line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #f3f3f3; text-align: left; padding: 8px 6px; font-size: 12px; font-weight: 700; border-bottom: 2px solid #333; }
        td { padding: 7px 6px; font-size: 12px; border-bottom: 1px solid #ddd; }
        .text-right { text-align: right; }
        .mono { font-family: 'Courier New', monospace; }
        .imei { font-size: 10px; color: #777; }
        .variation { font-size: 10px; color: #2563eb; font-weight: 600; }
        .summary { border-top: 2px solid #333; padding-top: 10px; }
        .summary-row { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; }
        .summary-row.total { font-size: 16px; font-weight: 800; border-top: 1px solid #999; padding-top: 8px; margin-top: 4px; }
        .summary-row.pending { color: #dc2626; font-weight: 700; }
        .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #888; border-top: 1px dashed #ccc; padding-top: 10px; }
        @media print { body { padding: 10px; } }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  if (!purchase) return null;
  const pending = purchase.totalAmount - purchase.paidAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5" /> Purchase Invoice</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="bg-white text-black p-6 rounded-lg border">
          {/* Header */}
          <div className="header">
            <div className="shop-name">{shop.shopName || "Saim Mobile"}</div>
            {shop.address && <div className="shop-detail">{shop.address}</div>}
            {shop.phone && <div className="shop-detail">Phone: {shop.phone}</div>}
            {shop.email && <div className="shop-detail">Email: {shop.email}</div>}
            {shop.tagline && <div className="shop-detail" style={{ fontStyle: "italic", marginTop: 4 }}>{shop.tagline}</div>}
            <div className="invoice-title">Purchase Invoice</div>
          </div>

          {/* Meta */}
          <div className="meta">
            <div>
              <div><strong>Supplier:</strong> {purchase.supplierName}</div>
              <div><strong>Date:</strong> {format(new Date(purchase.purchaseDate), "dd MMM yyyy")}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div><strong>Status:</strong> {purchase.paymentStatus.toUpperCase()}</div>
              <div><strong>Invoice #:</strong> {purchase.localId.slice(-8).toUpperCase()}</div>
            </div>
          </div>

          {/* Items Table */}
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Type</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Sale</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((item, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>
                    {item.productName}
                    {(item.variationStorage || item.variationColor) && (
                      <div className="variation">
                        {item.variationStorage} / {item.variationColor}
                      </div>
                    )}
                    {item.imeiNumbers.length > 0 && (
                      <div className="imei">
                        {item.imeiNumbers.map((imei, i) => (
                          <div key={i}>IMEI {i + 1}: {imei}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{item.unitType}</td>
                  <td className="text-right mono">Rs. {item.costPrice.toLocaleString()}</td>
                  <td className="text-right mono">Rs. {item.salePrice.toLocaleString()}</td>
                  <td className="text-right mono">Rs. {item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div className="summary">
            <div className="summary-row">
              <span>Total Amount:</span>
              <span className="mono">Rs. {purchase.totalAmount.toLocaleString()}</span>
            </div>
            <div className="summary-row">
              <span>Paid Amount:</span>
              <span className="mono">Rs. {purchase.paidAmount.toLocaleString()}</span>
            </div>
            {pending > 0 && (
              <div className="summary-row pending">
                <span>Pending Amount:</span>
                <span className="mono">Rs. {pending.toLocaleString()}</span>
              </div>
            )}
            <div className="summary-row total">
              <span>{pending > 0 ? "Pending Payable:" : "Net Payable:"}</span>
              <span className="mono">Rs. {pending > 0 ? pending.toLocaleString() : purchase.totalAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="footer">
            <div>Thank you for your business!</div>
            <div>{shop.shopName || "Saim Mobile"} — {shop.phone || ""}</div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}><X className="h-4 w-4 mr-1" /> Close</Button>
          <Button onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Print Invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseInvoice;
