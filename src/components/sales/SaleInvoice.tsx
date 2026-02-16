import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Printer, X } from "lucide-react";
import { Sale } from "@/lib/offlineSaleService";
import { getShopSettings } from "@/lib/shopSettings";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
}

const SaleInvoice = ({ open, onOpenChange, sale }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const shop = getShopSettings();

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Sale Invoice</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 10px; color: #111; font-size: 12px; max-width: 80mm; margin: 0 auto; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 10px; }
        .shop-name { font-size: 20px; font-weight: 800; letter-spacing: 1px; }
        .shop-detail { font-size: 10px; color: #555; margin-top: 1px; }
        .invoice-title { font-size: 14px; font-weight: 700; margin-top: 6px; text-transform: uppercase; letter-spacing: 2px; }
        .meta { font-size: 11px; margin-bottom: 8px; line-height: 1.5; }
        .meta-row { display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th { background: #f3f3f3; text-align: left; padding: 4px 3px; font-size: 10px; font-weight: 700; border-bottom: 2px solid #333; }
        td { padding: 4px 3px; font-size: 10px; border-bottom: 1px solid #ddd; }
        .text-right { text-align: right; }
        .mono { font-family: 'Courier New', monospace; }
        .variation { font-size: 9px; color: #2563eb; font-weight: 600; }
        .summary { border-top: 2px solid #333; padding-top: 6px; }
        .summary-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
        .summary-row.total { font-size: 14px; font-weight: 800; border-top: 1px solid #999; padding-top: 6px; margin-top: 4px; }
        .summary-row.pending { color: #dc2626; font-weight: 700; }
        .footer { text-align: center; margin-top: 16px; font-size: 10px; color: #888; border-top: 1px dashed #ccc; padding-top: 8px; }
        @media print { body { padding: 5px; } }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5" /> Sale Invoice</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="bg-white text-black p-6 rounded-lg border">
          <div className="header">
            <div className="shop-name">{shop.shopName || "Saim Mobile"}</div>
            {shop.address && <div className="shop-detail">{shop.address}</div>}
            {shop.phone && <div className="shop-detail">Phone: {shop.phone}</div>}
            {shop.email && <div className="shop-detail">Email: {shop.email}</div>}
            {shop.tagline && <div className="shop-detail" style={{ fontStyle: "italic", marginTop: 2 }}>{shop.tagline}</div>}
            <div className="invoice-title">Sale Invoice</div>
          </div>

          <div className="meta">
            <div className="meta-row"><span><strong>Invoice #:</strong> {sale.invoiceNumber}</span><span><strong>Date:</strong> {format(new Date(sale.saleDate), "dd MMM yyyy HH:mm")}</span></div>
            <div className="meta-row"><span><strong>Customer:</strong> {sale.customerName}</span><span><strong>Phone:</strong> {sale.customerPhone}</span></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Qty</th>
                <th className="text-right">Price</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>
                    {item.productName}
                    {(item.variationStorage || item.variationColor) && (
                      <div className="variation">{item.variationStorage} / {item.variationColor}</div>
                    )}
                  </td>
                  <td>{item.quantity}</td>
                  <td className="text-right mono">Rs. {item.salePrice.toLocaleString()}</td>
                  <td className="text-right mono">Rs. {item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="summary">
            <div className="summary-row"><span>Subtotal:</span><span className="mono">Rs. {sale.items.reduce((a, i) => a + i.total, 0).toLocaleString()}</span></div>
            {sale.totalAmount !== sale.items.reduce((a, i) => a + i.total, 0) && (
              <div className="summary-row">
                <span>{sale.totalAmount > sale.items.reduce((a, i) => a + i.total, 0) ? "Previous Balance:" : "Receivable Adjusted:"}</span>
                <span className="mono">Rs. {Math.abs(sale.totalAmount - sale.items.reduce((a, i) => a + i.total, 0)).toLocaleString()}</span>
              </div>
            )}
            <div className="summary-row"><span>Total Amount:</span><span className="mono">Rs. {sale.totalAmount.toLocaleString()}</span></div>
            <div className="summary-row"><span>Paid Amount:</span><span className="mono">Rs. {sale.paidAmount.toLocaleString()}</span></div>
            {sale.remainingAmount > 0 && (
              <div className="summary-row pending"><span>Remaining Amount:</span><span className="mono">Rs. {sale.remainingAmount.toLocaleString()}</span></div>
            )}
            <div className="summary-row total">
              <span>{sale.remainingAmount > 0 ? "Customer Payable:" : "Grand Total:"}</span>
              <span className="mono">Rs. {sale.remainingAmount > 0 ? sale.remainingAmount.toLocaleString() : sale.totalAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="footer">
            <div>{shop.invoiceMessage || "Thank you for your business!"}</div>
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

export default SaleInvoice;
