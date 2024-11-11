
const Order = require('../../models/orderSchema');
const fn = require('../../helpers/functions');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');

/* Sales report */
exports.getReport = async (req, res) => {

  let filter = req.query

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;
  
  const report = await getFilteredOrders(filter)
  
  const count = await Order.countDocuments({order_status: {$nin:['cancelled','return']}});
  const totalPages = Math.ceil(count / limit);


  const formattedReport = getFormatedReport(report[0].dailySummary,filter)

  res.render('admin/sales_report',{
    report: formattedReport,
    overAll:report[0].overallSummary[0],
    pageName:'report',
    filter,
    skip,
    page_limit: limit,
    currentPage: page,
    totalPages: totalPages,
    total_items: count,
    isAdmin: true,
  })
}

const getFilteredOrders = async (filter) => {

  const page = parseInt(filter.page) || 1;
  const limit = parseInt(filter.limit) || 5;
  const skip = (page - 1) * limit;

  let {startDate,endDate = new Date()} = filter
  let dateMatch = {}, projection = {},group = {}

  if(startDate && endDate){
    startDate = moment.utc(startDate, 'DD-MM-YYYY').startOf('day').toDate();
    endDate = moment.utc(endDate,"DD-MM-YYYY").endOf('day').toDate()
    dateMatch.createdAt = { $gte: startDate, $lte: endDate };
  }
  projection.day = {$dateToString: { format: "%d-%m-%Y", date: "$createdAt" } }
  group._id = "$day"

  if(filter.weekly){
    projection = {
      year: { $year: "$createdAt" },
      week: { $isoWeek: "$createdAt" }
    }
    group._id = { year: "$year", week: "$week" }
  }

  if(filter.monthly){
    projection = {
      year: { $year: "$createdAt" },
      month: { $month: "$createdAt" }
    }
    //projection.month = {$dateToString: { format: "%m-%Y", date: "$createdAt" } }
    group._id = { year: "$year", month: "$month" }
    //group._id = "$month"
  }

  if(filter.yearly){
    projection.year = { $year: "$createdAt" }
    group._id = "$year"
  }

  return await Order.aggregate([
    { $match: 
      { 
        order_status: {$nin:['cancelled','return']},
        ...dateMatch
      },
    },
    { $project: 
      {
        ...projection,
        total_amount: "$order_total", order_subtotal:1, tax:1, discounts:1,
        actual_revenue: { $sum: ["$order_subtotal"]},
        items: {$sum: "$cart.quantity"},
      } 
    },
    { $group: 
      {
        ...group,
        sales_revenue: { $sum: "$actual_revenue" },
        total_tax: {$sum: "$tax"},
        discounts: { $sum: "$discounts" },
        net_revenue: { $sum: "$total_amount" },
        orders: { $sum: 1 },
        sold_items: {$sum: "$items" },
      } 
    },
    { $sort: { _id: 1 } },
    { 
      $facet: {
        dailySummary: [
          { $skip: skip },
          { $limit: limit }
        ],
        overallSummary: [
          { 
            $group: {
              _id: null,
              overall_sales_revenue: { $sum: "$sales_revenue" },
              overall_tax: {$sum: "$total_tax"},
              overall_discounts: { $sum: "$discounts" },
              overall_net_revenue: { $sum: "$net_revenue" },
              overall_orders: { $sum: "$orders" },
              overall_sold_items: { $sum: "$sold_items" }
            }
          }
        ]
      }
    }
  ]);
}

const getFormatedReport = function(data, filter){
  return data.map(item => {
    let date = null
    if(filter.weekly){
      const dateRange = fn.getDateRangeOfWeek(item._id.week,item._id.year,'DD-MM-YY')
      date = `${dateRange.start} - ${dateRange.end}`
    }else if(filter.monthly){
      const dateRange = fn.getDateRangeOfMonth(item._id.month - 1,item._id.year,'MMM-YY')
      date = `${dateRange.start}`
    }else{
      date = item._id
    }
    item.sales_revenue = item.sales_revenue.toFixed(2)
    item.total_tax = item.total_tax.toFixed(2)
    item.discounts = item.discounts.toFixed(2)
    item.net_revenue = item.net_revenue.toFixed(2)
    return {
      ...item,
      date
    }
  })
}

exports.downloadPDF = async(req,res) => {

  const report = await getFilteredOrders(req.query);

  const pdfData = await generatePDF(report[0],req.query);
  
  //res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');
  res.setHeader('Content-Disposition', 'inline; filename=sales_report.pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.end(pdfData);
}

const generatePDF = async (salesData,filter) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({margin:50});
    const buffer = [];

    doc.on('data', chunk => buffer.push(chunk));

    doc.on('end', () => {
      const pdfData = Buffer.concat(buffer);
      resolve(pdfData);
    });

    doc.on('error', (err) => {
      reject(err);
    });

    generateHeader(doc,filter);
	  
    generateInvoiceTable(doc,salesData,filter)

    generateFooter(doc);

    doc.end();
  });
};

function generateHeader(doc,filter) {

  const dynamicTitle = Object.keys(filter)[0].charAt(0).toUpperCase() + Object.keys(filter)[0].slice(1).toLowerCase()

	doc.image('public/admin/images/icons/logo.png', 50, 45, { width: 70 })
		.fillColor('#444444')
		.fontSize(12)
		.text('E-commerce', 50, 70)
    .fontSize(20)
    .text(`${dynamicTitle} Sales Report`, 0, 90, {align: 'center'})
    .fontSize(10)
    .text('Generated on:'+ new Date().toLocaleString(), 0, 115, { align: 'center' })
		.fontSize(10)
		.text('Park Avenue', 200, 55, { align: 'right' })
		.text('Calicut, India, 676001', 200, 70, { align: 'right' })
		.moveDown();
}

function generateFooter(doc) {
	doc.fontSize(
		10,
	).text(
		'Payment is due within 15 days. Thank you for your business.',
		50,
		730,
		{ align: 'center', width: 500 },
	);
}

function generateInvoiceTable(doc, invoice,filter) {
  let i;
  const invoiceTableTop = 160;

  doc.font("Helvetica-Bold");
  generateTableRow(
    doc,
    invoiceTableTop,
    "Date",
    "Sales",
    "Tax",
    "Discounts",
    "Net Revenue",
    "Orders",
    "Sold Items"
  );
  generateHr(doc, invoiceTableTop + 20);
  doc.font("Helvetica");

  const orderData = getFormatedReport(invoice.dailySummary,filter)

  for (i = 0; i < orderData.length; i++) {
    const item = orderData[i];
    const position = invoiceTableTop + (i + 1) * 30;
    generateTableRow(
      doc,
      position,
      item.date,
      item.sales_revenue,
      item.total_tax,
      item.discounts,
      item.net_revenue,
      item.orders,
      item.sold_items
    );

    generateHr(doc, position + 20);
  }

  const summery = invoice.overallSummary[0]
  const totalsPosition = invoiceTableTop + (i + 1) * 30
  doc.font("Helvetica-Bold");
  generateTableRow(
    doc,
    totalsPosition,
    "Totals:",
    summery.overall_sales_revenue.toFixed(2),
    summery.overall_tax.toFixed(2),
    summery.overall_discounts.toFixed(2),
    summery.overall_net_revenue.toFixed(2),
    summery.overall_orders,
    summery.overall_sold_items
  );

  generateHr(doc, invoiceTableTop + 20);

  /*   const subtotalPosition = invoiceTableTop + (i + 1) * 30;
  generateTableRow(
    doc,
    subtotalPosition,
    "",
    "",
    "Subtotal",
    "",
    formatCurrency(invoice.subtotal)
  );

const paidToDatePosition = subtotalPosition + 20;
  generateTableRow(
    doc,
    paidToDatePosition,
    "",
    "",
    "Paid To Date",
    "",
    formatCurrency(invoice.paid)
  );

  const duePosition = paidToDatePosition + 25;
  doc.font("Helvetica-Bold");
  generateTableRow(
    doc,
    duePosition,
    "",
    "",
    "Balance Due",
    "",
    formatCurrency(invoice.subtotal - invoice.paid)
  );
  doc.font("Helvetica"); */
}

function generateHr(doc, y) {
  doc
    .strokeColor("#aaaaaa")
    .lineWidth(1)
    .moveTo(50, y)
    .lineTo(560, y)
    .stroke();
}

function formatCurrency(cents) {
  return /* "$" + */ (cents).toFixed(2);
}

function generateTableRow(doc, y, c1, c2, c3, c4, c5, c6, c7) {
	doc.fontSize(10)
		.text(c1, 50, y)
		.text(c2, 140, y,{width: 90, align: 'right'})
    .text(c3, 200, y,{width: 90, align: 'right'})
		.text(c4, 270, y, { width: 90, align: 'right' })
		.text(c5, 350, y, { width: 90, align: 'right' })
    .text(c6, 460, y, { width: 90, align: 'left' })
		.text(c7, 510, y, { align: 'left' });
}


const generateExcel = (salesData,filter) => {

  const order_data = getFormatedReport(salesData.dailySummary,filter)

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');

  worksheet.columns = [
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Sales Revenue', key: 'sales_revenue', width: 20 },
    { header: 'Tax', key: 'tax', width: 10 },
    { header: 'Discounts', key: 'discounts', width: 10 },
    { header: 'Net Revenue', key: 'net_revenue', width: 20 },
    { header: 'Orders', key: 'orders', width: 10 },
    { header: 'Sold Items', key: 'sold_items', width: 10 },
  ];

  // formating
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true }; 
    cell.alignment = { vertical: 'middle' }; 
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF00' }, 
    };
  });


  order_data.forEach((sale) => {
    worksheet.addRow({
      date: sale.date,
      sales_revenue: sale.sales_revenue,
      tax: sale.total_tax,
      discounts: sale.discounts,
      net_revenue: sale.net_revenue,
      sales_revenue: sale.sales_revenue,
      orders: sale.orders,
      sold_items: sale.sold_items,
    });
  });

  worksheet.getColumn('sales_revenue').numFmt = '"₹"#,##0.00';
  worksheet.getColumn('tax').numFmt = '"₹"#,##0.00';
  worksheet.getColumn('discounts').numFmt = '"₹"#,##0.00';
  worksheet.getColumn('net_revenue').numFmt = '"₹"#,##0.00';


  worksheet.addRow({
    date: "",
    sales_revenue: "",
    tax: "",
    discounts: "",
    net_revenue: "",
    orders: "",
    sold_items: "",
  })

  const summery = salesData.overallSummary[0]
  worksheet.addRow({
    date: 'Totals:',
    sales_revenue: summery.overall_sales_revenue,
    tax: summery.overall_tax,
    discounts: summery.overall_discounts,
    net_revenue: summery.overall_net_revenue,
    orders: summery.overall_orders,
    sold_items: summery.overall_sold_items,
  })

  const lastRow = worksheet.lastRow;
  lastRow.eachCell((cell) => {
    cell.font = { bold: true };
  });

  return workbook;
};

exports.downloadEXCEL = async (req, res) => {
  const report = await getFilteredOrders(req.query);

  const workbook = generateExcel(report[0],req.query);

  res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await workbook.xlsx.write(res);
  res.end();
};