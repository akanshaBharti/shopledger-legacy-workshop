var test = require('node:test');
var assert = require('node:assert/strict');

var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');

test('CORRECT BEHAVIOUR: invoice figures match checkout pricing for mixed HSN GST lines', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 },
    { id: 8, name: 'Tea', hsn: '0902', price: 140, qty: 1 },
    { id: 9, name: 'Coffee', hsn: '0901', price: 310, qty: 1 }
  ];
  var ledger = pricing.computeTotals(items, '');
  var order = {
    id: 1009,
    date: '15/11/2026',
    customer: 'Repro Customer',
    items: items,
    coupon: '',
    subtotal: ledger.subtotal,
    discount: ledger.discount,
    tax: ledger.tax,
    total: ledger.total
  };

  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual({
    subtotal: figures.subtotal,
    discount: figures.discount,
    tax: figures.tax,
    cgst: figures.cgst,
    sgst: figures.sgst,
    total: figures.total
  }, {
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    cgst: ledger.cgst,
    sgst: ledger.sgst,
    total: order.total
  });
  assert.deepEqual(figures.rows.map(function (row) {
    return { hsn: row.hsn, gstPercent: row.gstPercent, lineTax: row.lineTax };
  }), [
    { hsn: '1006', gstPercent: 5, lineTax: 32 },
    { hsn: '0902', gstPercent: 18, lineTax: 25.2 },
    { hsn: '0901', gstPercent: 18, lineTax: 55.8 }
  ]);
});
