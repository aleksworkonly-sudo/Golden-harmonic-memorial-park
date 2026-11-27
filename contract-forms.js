/* contract-forms.js — builds the printable Spot Cash Contract and Payment Agreement.
   The wording is copied from the company's sample documents. Staff fill the blanks in the admin
   (buyer, plot, price and plan come from the reservation); anything left empty prints as a line
   to be filled by hand.
   window.GHContract.print(d)  d = { plan:'cash'|'installment', ref, buyer, address, place, day, month, year,
     sellerOffice, officerName, officerTitle, witness1, witness2, plots:[{type,location}], area, crypts,
     total, down, monthly, months, dueDay } */
(function () {
  'use strict';
  var e = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var php = function (n) { return 'PHP ' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var b = function (v, w) { var s = String(v == null ? '' : v).trim(); return '<span class="b" style="min-width:' + (w || 90) + 'px">' + (s ? e(s) : '&nbsp;') + '</span>'; };
  var CSS = '@page{size:A4;margin:18mm 16mm}body{font-family:"Times New Roman",Times,serif;font-size:12.5px;line-height:1.45;color:#000;margin:0}' +
    'h1{font-size:17px;text-align:center;margin:0;letter-spacing:.5px}h2{font-size:14px;text-align:center;margin:2px 0}.sub{text-align:center;font-style:italic;margin-bottom:12px}' +
    'h3{font-size:12.5px;margin:12px 0 3px}p{margin:4px 0;text-align:justify}.b{display:inline-block;border-bottom:1px solid #000;padding:0 4px;font-weight:bold}' +
    '.kv{margin:4px 0 4px 36px}.kv div{margin:2px 0}ul,ol{margin:3px 0 3px 22px;padding-left:12px}li{margin:2px 0}' +
    '.sig{display:flex;gap:30px;margin-top:14px}.sig>div{flex:1}.ln{border-bottom:1px solid #000;height:22px}.pb{page-break-before:always}' +
    'table.g{width:100%;border-collapse:collapse;margin:8px 0}table.g td,table.g th{border:1px solid #000;padding:6px;text-align:left;height:26px}.foot{margin-top:18px;font-size:10px;color:#444}' +
    '.keep{page-break-inside:avoid}.sl{display:flex;align-items:flex-end;gap:6px;height:30px}.sl i{flex:1;border-bottom:1px solid #000;height:1px}';
  function ordinal(n) { n = parseInt(n, 10); if (!n) return ''; var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function parties(d, kind) {
    return '<p>This ' + kind + ' (“' + (/Agreement$/.test(kind) ? 'Agreement' : 'Contract') + '”) is made and entered into this ' + b(ordinal(d.day) , 50) + ' day of ' + b(d.month, 90) + ', ' + b(d.year, 40) + ', in ' + b(d.place, 130) + ', Philippines, by and between:</p>' +
      '<p><b>GOLDEN HARMONIC MEMORIAL PARK, INC.</b>, a corporation duly organized and existing under the laws of the Republic of the Philippines, with principal office at ' + b(d.sellerOffice, 260) + ', represented herein by its authorized officer, hereinafter referred to as the “SELLER”;</p>' +
      '<p style="text-align:center">-and-</p>' +
      '<p>' + b(d.buyer, 200) + ', of legal age, Filipino, with residence and postal address at ' + b(d.address, 240) + ', hereinafter referred to as the “BUYER.”</p>' +
      '<p>The SELLER and the BUYER are hereinafter collectively referred to as the “PARTIES.”</p>';
  }
  function subject(d, title) {
    var plots = (d.plots && d.plots.length ? d.plots : [{}]);
    return '<h3>1. SUBJECT OF THE ' + title + '</h3><p>The SELLER agrees to sell, and the BUYER agrees to purchase, the following memorial park property:</p>' +
      '<div class="kv"><div>Plot Type: ' + b(plots.map(function (p) { return p.type; }).filter(Boolean).join(', '), 220) + '</div>' +
      '<div>Location / Block / Lot No.: ' + b(plots.map(function (p) { return p.location; }).filter(Boolean).join(', '), 220) + '</div>' +
      '<div>Area / Size: ' + b(d.area, 160) + '</div><div>Number of Crypts: ' + b(d.crypts, 100) + '</div></div>';
  }
  function price(d, n) {
    return '<h3>' + n + '. PURCHASE PRICE</h3><p>The total purchase price of the above-described memorial park property is:</p><p style="margin-left:36px"><b>' + php(d.total) + '</b></p>';
  }
  function sigs(d, n, kind) {
    return '<div class="keep"><h3>' + n + '. SIGNATURES</h3><p>IN WITNESS WHEREOF, the PARTIES have hereunto set their hands this ' + b('', 40) + ' day of ' + b('', 90) + ', ' + b(d.year, 40) + ', in ' + b(d.place, 130) + ', Philippines.</p>' +
      '<div class="sig"><div><b>SELLER:</b><br>GOLDEN HARMONIC MEMORIAL PARK, INC.<div class="sl"><span>By:</span><i></i></div>Name: ' + b(d.officerName, 150) + '<br>Title: ' + b(d.officerTitle, 150) + '</div>' +
      '<div><b>BUYER:</b><br>&nbsp;<div class="sl"><span>Signature:</span><i></i></div>Name: ' + b(d.buyer, 150) + '</div></div>' +
      '<p style="margin-top:12px">Signed in the presence of:</p><div class="sig"><div>Witness: ' + b(d.witness1, 170) + '</div><div>Witness: ' + b(d.witness2, 170) + '</div></div></div>';
  }
  function notary(d) {
    return '<div class="pb"><h2>ACKNOWLEDGMENT</h2><p>REPUBLIC OF THE PHILIPPINES</p>' +
      '<p>BEFORE ME, a Notary Public for and in ' + b('', 150) + ', this ' + b('', 40) + ' day of ' + b('', 90) + ', ' + b(d.year, 40) + ', personally appeared:</p>' +
      '<table class="g"><tr><th>Name</th><th>ID Presented</th><th>ID No.</th><th>Date/Place Issued</th></tr><tr><td><b>' + e(d.buyer) + '</b></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td></tr></table>' +
      '<p>known to me and to me known to be the same persons who executed the foregoing instrument and they acknowledged to me that the same is their free and voluntary act and deed.</p><p>WITNESS MY HAND AND NOTARIAL SEAL.</p>' +
      '<div style="height:120px"></div><div class="foot">Reservation ref: ' + e(d.ref) + '</div></div>';
  }
  function cash(d) {
    return '<h1>GOLDEN HARMONIC MEMORIAL PARK</h1><h2>SPOT CASH FULL PAYMENT CONTRACT</h2><div class="sub">Memorial Park Plot / Crypt Purchase</div>' + parties(d, 'Spot Cash Full Payment Contract') + subject(d, 'CONTRACT') + price(d, 2) +
      '<h3>3. FULL PAYMENT</h3><p>The BUYER acknowledges and agrees that the full purchase price has been paid in full upon execution of this Contract.</p><p>The SELLER acknowledges receipt of the full payment in the amount stated above.</p>' +
      '<h3>4. TRANSFER OF RIGHTS</h3><p>Upon full payment, the SELLER shall transfer to the BUYER all rights, interests, and ownership over the subject property, subject to the rules and regulations of Golden Harmonic Memorial Park and applicable law.</p>' +
      '<h3>5. NO FURTHER INSTALLMENT OBLIGATION</h3><p>Because this is a spot cash full payment transaction, the BUYER shall have no further installment obligation on the subject property, except for any future charges, fees, or obligations expressly allowed by law or company policy.</p>' +
      '<h3>6. TAXES AND FEES</h3><p>All taxes, fees, and charges arising from the sale, transfer, or registration of the property shall be borne by the party required by law or by agreement of the PARTIES.</p>' +
      '<h3>7. POSSESSION AND USE</h3><p>The BUYER shall have the right to use the plot only in accordance with the rules and regulations of Golden Harmonic Memorial Park and applicable laws, rules, and ordinances.</p>' +
      '<h3>8. COMPANY RULES</h3><p>The BUYER agrees to comply with all memorial park rules, regulations, policies, and future reasonable amendments adopted by the SELLER.</p>' +
      '<h3>9. REFUND POLICY</h3><p>The BUYER acknowledges that any refund, if allowed by the SELLER, shall be subject to the Company’s refund policy and applicable law.</p>' +
      '<h3>10. TRANSFER / ASSIGNMENT</h3><p>The BUYER may not transfer, assign, or sell the rights under this Contract without the prior written consent of the SELLER and compliance with the Company’s transfer policy.</p>' +
      '<h3>11. WARRANTIES OF THE SELLER</h3><p>The SELLER warrants that it has the authority to enter into this Contract and to sell the subject property, subject to the terms herein and applicable law.</p>' +
      '<h3>12. GOVERNING LAW</h3><p>This Contract shall be governed by and construed in accordance with the laws of the Republic of the Philippines.</p>' +
      '<h3>13. ENTIRE AGREEMENT</h3><p>This Contract contains the entire agreement between the PARTIES with respect to the subject matter hereof and supersedes all prior discussions, representations, or agreements.</p>' +
      sigs(d, 14) + notary(d);
  }
  function installment(d) {
    var due = d.dueDay ? 'Every ' + ordinal(d.dueDay) + ' day of the month' : '';
    return '<h1>GOLDEN HARMONIC MEMORIAL PARK</h1><h2>PAYMENT AGREEMENT</h2><div class="sub">Memorial Park Plot / Crypt Installment Purchase</div>' + parties(d, 'Payment Agreement') + subject(d, 'AGREEMENT') + price(d, 2) +
      '<h3>3. PAYMENT TERMS</h3><p>The BUYER shall pay the purchase price in installments as follows:</p><div class="kv"><div>Down Payment: <b>' + php(d.down) + '</b></div><div>Monthly Amortization: <b>' + php(d.monthly) + '</b></div><div>Number of Months: <b>' + e(d.months) + '</b></div><div>Due Date of Monthly Payment: ' + b(due, 190) + '</div></div><p>All payments shall be made only through the SELLER’s approved payment channels.</p>' +
      '<h3>4. ADVANCE OR EXCESS PAYMENTS</h3><p>Any amount paid by the BUYER in excess of the required monthly installment shall be applied to the principal balance of the account, unless otherwise agreed in writing by the SELLER.</p><p>When advance payments are applied to the principal balance, the remaining balance shall be recomputed. The monthly installment amount shall remain unchanged, while the number of remaining monthly payments shall be reduced accordingly.</p><p>Excess payments shall not automatically be treated as payment for future monthly installments unless confirmed in writing by the SELLER.</p>' +
      '<h3>5. NO TRANSFER OF OWNERSHIP UNTIL FULL PAYMENT</h3><p>The BUYER acknowledges that this is a Contract to Sell and not yet a Deed of Absolute Sale. Ownership, title, and full rights over the property shall be transferred to the BUYER only upon:</p><ol><li>full payment of the purchase price;</li><li>compliance with all terms and conditions of this Agreement;</li><li>execution of the appropriate Deed of Absolute Sale or other transfer document, if applicable.</li></ol>' +
      '<h3>6. PAYMENT DEFAULT</h3><p>If the BUYER fails to pay the monthly amortization for three (3) consecutive months, the SELLER may apply the Company’s policy on default, notice, and forfeiture, subject to due process and applicable law.</p>' +
      '<h3>7. NOTICE REQUIREMENT</h3><p>Before any forfeiture or cancellation, the SELLER shall provide notice through one or more of the following:</p><ul><li>email</li><li>physical written notice</li><li>phone call</li><li>text message</li></ul><p>The BUYER acknowledges that the Company may require proof of receipt for physical notices sent to the BUYER’s address.</p>' +
      '<h3>8. FORFEITURE / CANCELLATION</h3><p>If the BUYER remains unpaid and gives no response after the required notices, the SELLER may cancel the installment plan and recover the plot, subject to the Company’s policy and applicable law.</p><p>If the BUYER later pays the full remaining amount after the notice period, the SELLER may accept the payment, subject to an additional PHP 1,500.00 administrative fee.</p>' +
      '<h3>9. REFUND POLICY</h3><p>The BUYER acknowledges that any refund, if allowed by the SELLER, shall be subject to the Company’s refund policy and applicable law.</p>' +
      '<h3>10. TRANSFER / ASSIGNMENT</h3><p>The BUYER may not transfer, assign, or sell the rights under this Agreement without the prior written consent of the SELLER and compliance with the Company’s transfer policy.</p><p>If the BUYER is unable to continue paying and wishes to transfer or assign the account, the transfer shall be subject to the Company’s assumption policy, administrative fee, and approval requirements.</p>' +
      '<h3>11. ASSUMPTION / TRANSFER OF ACCOUNT</h3><p>If the BUYER requests a transfer or assumption of account:</p><ul><li>the request must be made in writing;</li><li>the transfer must be completed within the period allowed by Company policy;</li><li>an administrative fee of PHP 2,000.00 may apply;</li><li>the remaining unpaid balance must be settled unless otherwise approved in writing by the Company;</li><li>the new buyer must be approved by the Company and complete the required documentation.</li></ul>' +
      '<h3>12. TAXES AND FEES</h3><p>All taxes, fees, and charges arising from the sale, transfer, or registration of the property shall be borne by the party required by law or by agreement of the PARTIES.</p>' +
      '<h3>13. POSSESSION AND USE</h3><p>The BUYER shall have the right to use the plot only in accordance with the rules and regulations of Golden Harmonic Memorial Park and applicable laws, rules, and ordinances.</p>' +
      '<h3>14. COMPANY RULES</h3><p>The BUYER agrees to comply with all memorial park rules, regulations, policies, and future reasonable amendments adopted by the SELLER.</p>' +
      '<h3>15. WARRANTIES OF THE SELLER</h3><p>The SELLER warrants that it has the authority to enter into this Agreement and to sell the subject property, subject to the terms herein and applicable law.</p>' +
      '<h3>16. GOVERNING LAW</h3><p>This Agreement shall be governed by and construed in accordance with the laws of the Republic of the Philippines.</p>' +
      '<h3>17. ENTIRE AGREEMENT</h3><p>This Agreement contains the entire agreement between the PARTIES with respect to the subject matter hereof and supersedes all prior discussions, representations, or agreements.</p>' +
      sigs(d, 18) + notary(d);
  }
  function html(d) {
    var title = d.plan === 'cash' ? 'Spot Cash Contract' : 'Payment Agreement';
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + e(title + ' ' + (d.ref || '')) + '</title><style>' + CSS + '</style></head><body>' + (d.plan === 'cash' ? cash(d) : installment(d)) + '</body></html>';
  }
  function print(d) {
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    var doc = f.contentWindow.document; doc.open(); doc.write(html(d)); doc.close();
    setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(function () { f.remove(); }, 60000); }, 300);
  }
  window.GHContract = { html: html, print: print, ordinal: ordinal };
})();
