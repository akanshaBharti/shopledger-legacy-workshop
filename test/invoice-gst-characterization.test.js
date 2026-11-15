var test = require('node:test');
var assert = require('node:assert/strict');

var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');
var reports = require('../lib/reports');

var mixedItems = [
  { id: 1, sku: 'GRN-001', name: 'Rice', hsn: '1006', price: 640, qty: 1 },
  { id: 6, sku: 'DRY-001', name: 'Ghee', hsn: '0405', price: 450, qty: 1 },
  { id: 8, sku: 'BEV-001', name: 'Tea', hsn: '0902', price: 140, qty: 1 }
];

var couponItems = [
  { id: 1, sku: 'GRN-001', name: 'Rice', hsn: '1006', price: 640, qty: 1 },
  { id: 9, sku: 'BEV-002', name: 'Coffee', hsn: '0901', price: 310, qty: 1 }
];

function orderFromPricing(id, items, coupon) {
  var totals = pricing.computeTotals(items, coupon || '');
  return {
    id: id,
    date: '15/11/2026',
    customer: 'Characterization Customer',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('CURRENT BEHAVIOUR: checkout pricing resolves GST from HSN slabs', function () {
  var totals = pricing.computeTotals(mixedItems, '');

  assert.deepEqual(totals, {
    subtotal: 1230,
    discount: 0,
    taxable: 1230,
    tax: 111.2,
    cgst: 55.6,
    sgst: 55.6,
    total: 1341.2,
    lines: [
      {
        id: 1,
        name: 'Rice',
        hsn: '1006',
        gstPercent: 5,
        gross: 640,
        discount: 0,
        taxable: 640,
        tax: 32,
        net: 672
      },
      {
        id: 6,
        name: 'Ghee',
        hsn: '0405',
        gstPercent: 12,
        gross: 450,
        discount: 0,
        taxable: 450,
        tax: 54,
        net: 504
      },
      {
        id: 8,
        name: 'Tea',
        hsn: '0902',
        gstPercent: 18,
        gross: 140,
        discount: 0,
        taxable: 140,
        tax: 25.2,
        net: 165.2
      }
    ]
  });
});

test('CORRECT BEHAVIOUR: invoice uses the same HSN GST rates as checkout when gstRate is absent', function () {
  var order = orderFromPricing(1001, mixedItems, '');
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(order.tax, 111.2);
  assert.equal(order.total, 1341.2);
  assert.equal(figures.tax, 111.2);
  assert.equal(figures.cgst, 55.6);
  assert.equal(figures.sgst, 55.6);
  assert.equal(figures.total, 1341.2);
  assert.deepEqual(figures.rows.map(function (row) {
    return { hsn: row.hsn, gstPercent: row.gstPercent, lineTax: row.lineTax };
  }), [
    { hsn: '1006', gstPercent: 5, lineTax: 32 },
    { hsn: '0405', gstPercent: 12, lineTax: 54 },
    { hsn: '0902', gstPercent: 18, lineTax: 25.2 }
  ]);
});

test('CORRECT BEHAVIOUR: invoice applies the same coupon calculation as checkout', function () {
  var order = orderFromPricing(1002, couponItems, 'SAVE10');
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual({
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    total: order.total
  }, {
    subtotal: 950,
    discount: 95,
    tax: 79.02,
    total: 934.02
  });

  assert.deepEqual({
    subtotal: figures.subtotal,
    discount: figures.discount,
    tax: figures.tax,
    total: figures.total
  }, {
    subtotal: 950,
    discount: 95,
    tax: 79.02,
    total: 934.02
  });
});

test('CORRECT BEHAVIOUR: GST reconciliation finds no mismatch for active checkout orders and skips cancelled orders', function () {
  var firstOrder = orderFromPricing(1001, mixedItems, '');
  var secondOrder = orderFromPricing(1002, couponItems, 'SAVE10');
  var cancelledOrder = orderFromPricing(1003, mixedItems, '');
  cancelledOrder.status = 'cancelled';

  var reconciliation = reports.getGstReconciliation({
    orders: [firstOrder, secondOrder, cancelledOrder]
  });

  assert.equal(reconciliation.totalChecked, 2);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.totalDelta, 0);
  assert.deepEqual(reconciliation.rows.map(function (row) {
    return {
      orderId: row.orderId,
      ledgerTax: row.ledgerTax,
      invoiceTax: row.invoiceTax,
      ledgerTotal: row.ledgerTotal,
      invoiceTotal: row.invoiceTotal,
      delta: row.delta,
      matched: row.matched
    };
  }), [
    {
      orderId: 1001,
      ledgerTax: 111.2,
      invoiceTax: 111.2,
      ledgerTotal: 1341.2,
      invoiceTotal: 1341.2,
      delta: 0,
      matched: true
    },
    {
      orderId: 1002,
      ledgerTax: 79.02,
      invoiceTax: 79.02,
      ledgerTotal: 934.02,
      invoiceTotal: 934.02,
      delta: 0,
      matched: true
    }
  ]);
});

test('CORRECT BEHAVIOUR: rendered invoice shows the billed GST and total without a mismatch warning', function () {
  var order = orderFromPricing(1001, mixedItems, '');
  var html = invoice.render(order);

  assert.match(html, /Invoice Total<\/td><td class="r">₹1341\.20/);
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹111\.20/);
  assert.doesNotMatch(html, /differs from Order Ledger recorded total/);
});
