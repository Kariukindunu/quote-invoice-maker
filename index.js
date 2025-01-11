const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Store quotes and invoices in memory (in a real app, you'd use a database)
const quotes = [];
const invoices = [];

// Company details
let companyDetails = {
    name: "Defrapad IT Solutions",
    address: "123 Tech Street",
    city: "Nairobi",
    country: "Kenya",
    phone: "+254 700 000000",
    email: "info@defrapad.com",
    website: "www.defrapad.com",
    logo: "public/images/logo.png",
    currency: "KSH",
    selectedInvoiceTemplate: "classic",
    selectedQuoteTemplate: "classic",
    terms: [
        "Payment is due within 30 days",
        "Please include invoice number on your payment",
        "Make all checks payable to Defrapad IT Solutions",
        "Late payments are subject to a 1.5% monthly fee"
    ]
};

// Add input sanitization function
function sanitizeInput(input) {
    if (typeof input === 'string') {
        return input.trim().replace(/[<>]/g, '');
    }
    return input;
}

// Add input validation middleware
const validateQuoteInput = (req, res, next) => {
    const { customerName, items, subtotal, tax, total } = req.body;
    
    if (!customerName || customerName.trim().length < 2) {
        return res.status(400).send('Invalid customer name');
    }

    if (!Array.isArray(items)) {
        return res.status(400).send('Items must be an array');
    }

    for (const item of items) {
        if (!item.description || !item.quantity || !item.price) {
            return res.status(400).send('All items must have description, quantity, and price');
        }
        if (isNaN(item.quantity) || item.quantity <= 0) {
            return res.status(400).send('Quantity must be a positive number');
        }
        if (isNaN(item.price) || item.price <= 0) {
            return res.status(400).send('Price must be a positive number');
        }
    }

    if (isNaN(subtotal) || subtotal <= 0) {
        return res.status(400).send('Invalid subtotal');
    }
    if (isNaN(tax) || tax < 0) {
        return res.status(400).send('Invalid tax');
    }
    if (isNaN(total) || total <= 0) {
        return res.status(400).send('Invalid total');
    }

    next();
};

// Add company settings routes
app.get('/settings', (req, res) => {
    res.render('settings', { companyDetails });
});

app.post('/settings', (req, res) => {
    companyDetails = {
        ...companyDetails,
        name: sanitizeInput(req.body.name),
        address: sanitizeInput(req.body.address),
        city: sanitizeInput(req.body.city),
        country: sanitizeInput(req.body.country),
        phone: sanitizeInput(req.body.phone),
        email: sanitizeInput(req.body.email),
        website: sanitizeInput(req.body.website),
        currency: sanitizeInput(req.body.currency) || "KSH",
        selectedInvoiceTemplate: sanitizeInput(req.body.selectedInvoiceTemplate) || "classic",
        selectedQuoteTemplate: sanitizeInput(req.body.selectedQuoteTemplate) || "classic",
        terms: req.body.terms.split('\n').filter(term => term.trim() !== '')
    };
    res.redirect('/');
});

// Enhanced PDF generation function
function generatePDF(doc, data) {
    const style = data.templateStyle || 'classic';

    switch(style) {
        case 'modern':
            generateModernTemplate(doc, data);
            break;
        case 'minimal':
            generateMinimalTemplate(doc, data);
            break;
        default:
            generateClassicTemplate(doc, data);
    }
}

function generateClassicTemplate(doc, data) {
    // Classic template - Traditional business style
    if (fs.existsSync(companyDetails.logo)) {
        doc.image(companyDetails.logo, 50, 45, { width: 150 });
    }

    // Company details on right
    doc.font('Helvetica')
       .fontSize(10)
       .text(companyDetails.name, 400, 50, { align: 'right' })
       .text(companyDetails.address, 400, 65, { align: 'right' })
       .text(`${companyDetails.city}, ${companyDetails.country}`, 400, 80, { align: 'right' })
       .text(companyDetails.phone, 400, 95, { align: 'right' })
       .text(companyDetails.email, 400, 110, { align: 'right' })
       .text(companyDetails.website, 400, 125, { align: 'right' });

    // Document title
    doc.moveDown(4)
       .font('Helvetica-Bold')
       .fontSize(20)
       .text(`${data.status.toUpperCase()} #${data.number}`, { align: 'center' });

    // Customer details
    doc.moveDown()
       .fontSize(12)
       .text('Bill To:', 50, doc.y)
       .font('Helvetica')
       .text(data.customerName)
       .text(`Date: ${new Date(data.date).toLocaleDateString()}`);

    // Items table header
    doc.moveDown(2);
    const tableTop = doc.y;
    doc.font('Helvetica-Bold');

    // Draw table header
    doc.rect(50, tableTop, 500, 20).fill('#f0f0f0');
    doc.fillColor('#000000')
       .text('Description', 60, tableTop + 5, { width: 250 })
       .text('Quantity', 310, tableTop + 5, { width: 60 })
       .text('Price', 370, tableTop + 5, { width: 80 })
       .text('Amount', 450, tableTop + 5, { width: 80 });

    // Items
    let y = tableTop + 25;
    doc.font('Helvetica');

    data.items.forEach((item, i) => {
        const amount = item.quantity * item.price;
        // Alternate row colors
        if (i % 2 === 0) {
            doc.rect(50, y - 5, 500, 20).fill('#f9f9f9');
        }
        doc.fillColor('#000000')
           .text(item.description, 60, y, { width: 250 })
           .text(item.quantity.toString(), 310, y, { width: 60 })
           .text(`${companyDetails.currency} ${item.price.toFixed(2)}`, 370, y, { width: 80 })
           .text(`${companyDetails.currency} ${amount.toFixed(2)}`, 450, y, { width: 80 });
        y += 20;
    });

    // Totals
    const totalsY = y + 20;
    doc.font('Helvetica')
       .text('Subtotal:', 350, totalsY)
       .text(`${companyDetails.currency} ${data.subtotal}`, 450, totalsY)
       .text(`Tax (${data.tax}%):`, 350, totalsY + 20)
       .text(`${companyDetails.currency} ${(data.subtotal * data.tax / 100).toFixed(2)}`, 450, totalsY + 20)
       .font('Helvetica-Bold')
       .text('Total:', 350, totalsY + 40)
       .text(`${companyDetails.currency} ${data.total}`, 450, totalsY + 40);

    // Footer
    doc.font('Helvetica')
       .fontSize(10)
       .text('Thank you for your business!', 50, doc.page.height - 100, { align: 'center' })
       .text('Terms & Conditions:', 50, doc.page.height - 70)
       .font('Helvetica')
       .fontSize(8)
       .text(companyDetails.terms.map((term, index) => `${index + 1}. ${term}`).join('\n'), 
             50, doc.page.height - 60);
}

function generateModernTemplate(doc, data) {
    // Modern template - Contemporary design with color accents
    // Header with background color
    doc.rect(0, 0, doc.page.width, 150).fill('#2c3e50');
    
    // White text for header
    doc.fillColor('white')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text(companyDetails.name, 50, 50)
       .fontSize(12)
       .font('Helvetica')
       .text(companyDetails.address, 50, 80)
       .text(`${companyDetails.city}, ${companyDetails.country}`, 50, 95)
       .text(companyDetails.phone, 50, 110)
       .text(companyDetails.email, 50, 125);

    // Document type and number with accent bar
    doc.rect(50, 170, 10, 40).fill('#3498db');
    doc.fillColor('#2c3e50')
       .fontSize(28)
       .font('Helvetica-Bold')
       .text(`${data.status.toUpperCase()}`, 70, 170)
       .fontSize(12)
       .text(`#${data.number}`, 70, 200);

    // Customer section with modern layout
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('BILL TO', 400, 170)
       .font('Helvetica')
       .text(data.customerName, 400, 190)
       .text(`Date: ${new Date(data.date).toLocaleDateString()}`, 400, 205);

    // Items table with alternating background
    const tableTop = 250;
    doc.rect(50, tableTop, doc.page.width - 100, 30).fill('#f8f9fa');
    doc.fillColor('#2c3e50')
       .font('Helvetica-Bold')
       .text('Description', 70, tableTop + 10)
       .text('Qty', 350, tableTop + 10)
       .text('Price', 400, tableTop + 10)
       .text('Amount', 480, tableTop + 10);

    // Items with alternating colors
    let y = tableTop + 40;
    data.items.forEach((item, i) => {
        if (i % 2 === 0) {
            doc.rect(50, y - 5, doc.page.width - 100, 25).fill('#f8f9fa');
        }
        doc.fillColor('#2c3e50')
           .font('Helvetica')
           .text(item.description, 70, y)
           .text(item.quantity.toString(), 350, y)
           .text(`${companyDetails.currency} ${item.price.toFixed(2)}`, 400, y)
           .text(`${companyDetails.currency} ${(item.quantity * item.price).toFixed(2)}`, 480, y);
        y += 25;
    });

    // Modern totals section
    const totalsY = y + 20;
    doc.rect(400, totalsY, doc.page.width - 450, 100).fill('#f8f9fa');
    doc.fillColor('#2c3e50')
       .font('Helvetica')
       .text('Subtotal:', 420, totalsY + 10)
       .text(`Tax (${data.tax}%):`, 420, totalsY + 35)
       .font('Helvetica-Bold')
       .text('TOTAL:', 420, totalsY + 60)
       .font('Helvetica')
       .text(`${companyDetails.currency} ${data.subtotal}`, 480, totalsY + 10)
       .text(`${companyDetails.currency} ${(data.subtotal * data.tax / 100).toFixed(2)}`, 480, totalsY + 35)
       .text(`${companyDetails.currency} ${data.total}`, 480, totalsY + 60);

    // Modern footer
    doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill('#2c3e50');
    doc.fillColor('white')
       .fontSize(8)
       .text(companyDetails.website, doc.page.width / 2, doc.page.height - 25, { align: 'center' });
}

function generateMinimalTemplate(doc, data) {
    // Minimal template - Clean, spacious design
    // Simple header with just company name
    doc.font('Helvetica-Bold')
       .fontSize(24)
       .text(companyDetails.name, 50, 50)
       .fontSize(10)
       .font('Helvetica')
       .moveDown()
       .text(companyDetails.address)
       .text(`${companyDetails.city}, ${companyDetails.country}`)
       .text(companyDetails.phone)
       .text(companyDetails.email);

    // Document information with minimal styling
    doc.moveDown(2)
       .fontSize(36)
       .font('Helvetica-Bold')
       .text(data.status.toUpperCase(), { align: 'center' })
       .fontSize(12)
       .font('Helvetica')
       .text(`Document #: ${data.number}`, { align: 'center' })
       .text(`Date: ${new Date(data.date).toLocaleDateString()}`, { align: 'center' });

    // Customer section
    doc.moveDown(2)
       .text('For:', 50, doc.y)
       .font('Helvetica-Bold')
       .text(data.customerName);

    // Simple items table
    doc.moveDown(2);
    const tableTop = doc.y;
    
    // Thin lines instead of backgrounds
    doc.moveTo(50, tableTop).lineTo(550, tableTop).stroke();
    
    doc.font('Helvetica-Bold')
       .text('Description', 50, tableTop + 10)
       .text('Qty', 350, tableTop + 10)
       .text('Price', 400, tableTop + 10)
       .text('Amount', 480, tableTop + 10);

    doc.moveTo(50, tableTop + 30).lineTo(550, tableTop + 30).stroke();

    // Items with minimal styling
    let y = tableTop + 40;
    data.items.forEach(item => {
        doc.font('Helvetica')
           .text(item.description, 50, y)
           .text(item.quantity.toString(), 350, y)
           .text(`${companyDetails.currency} ${item.price.toFixed(2)}`, 400, y)
           .text(`${companyDetails.currency} ${(item.quantity * item.price).toFixed(2)}`, 480, y);
        y += 25;
    });

    doc.moveTo(50, y).lineTo(550, y).stroke();

    // Minimal totals section
    const totalsY = y + 20;
    doc.font('Helvetica')
       .text('Subtotal:', 400, totalsY)
       .text(`${companyDetails.currency} ${data.subtotal}`, 480, totalsY)
       .text(`Tax (${data.tax}%):`, 400, totalsY + 20)
       .text(`${companyDetails.currency} ${(data.subtotal * data.tax / 100).toFixed(2)}`, 480, totalsY + 20)
       .font('Helvetica-Bold')
       .text('Total:', 400, totalsY + 40)
       .text(`${companyDetails.currency} ${data.total}`, 480, totalsY + 40);

    // Minimal footer
    doc.fontSize(8)
       .font('Helvetica')
       .text('Terms & Conditions:', 50, doc.page.height - 100)
       .text(companyDetails.terms.map((term, index) => `${index + 1}. ${term}`).join('\n'), {
           width: 500,
           align: 'left'
       });
}

// Routes
app.get('/', (req, res) => {
    res.render('dashboard', { quotes, invoices });
});

// Quote routes
app.get('/create-quote', (req, res) => {
    res.render('create-quote');
});

app.post('/create-quote', validateQuoteInput, (req, res) => {
    const quote = {
        id: Date.now(),
        number: `Q${quotes.length + 1}`,
        date: new Date().toISOString().split('T')[0],
        customerName: sanitizeInput(req.body.customerName),
        items: req.body.items.map(item => ({
            description: sanitizeInput(item.description),
            quantity: parseFloat(item.quantity),
            price: parseFloat(item.price)
        })),
        subtotal: parseFloat(req.body.subtotal),
        tax: parseFloat(req.body.tax),
        total: parseFloat(req.body.total),
        status: 'quote'
    };
    quotes.push(quote);
    res.redirect('/');
});

// Convert quote to invoice
app.post('/convert-to-invoice/:id', (req, res) => {
    const quoteId = parseInt(req.params.id);
    const quote = quotes.find(q => q.id === quoteId);
    
    if (quote) {
        const invoice = {
            ...quote,
            id: Date.now(),
            number: `INV${invoices.length + 1}`,
            date: new Date().toISOString().split('T')[0],
            status: 'invoice'
        };
        invoices.push(invoice);
        // Remove quote after conversion
        const quoteIndex = quotes.findIndex(q => q.id === quoteId);
        quotes.splice(quoteIndex, 1);
    }
    res.redirect('/');
});

// Add PDF download routes
app.get('/download-quote/:id', (req, res) => {
    const quote = quotes.find(q => q.id === parseInt(req.params.id));
    if (!quote) {
        return res.status(404).send('Quote not found');
    }

    const doc = new PDFDocument();
    const filename = `quote-${quote.number}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    doc.pipe(res);
    generatePDF(doc, quote);
    doc.end();
});

app.get('/download-invoice/:id', (req, res) => {
    const invoice = invoices.find(i => i.id === parseInt(req.params.id));
    if (!invoice) {
        return res.status(404).send('Invoice not found');
    }

    const doc = new PDFDocument();
    const filename = `invoice-${invoice.number}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    doc.pipe(res);
    generatePDF(doc, invoice);
    doc.end();
});

// Add preview routes
app.post('/preview-invoice', (req, res) => {
    const doc = new PDFDocument();
    generatePDF(doc, { ...req.body, status: 'invoice' });
    
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    doc.end();
});

app.post('/preview-quote', (req, res) => {
    const doc = new PDFDocument();
    generatePDF(doc, { ...req.body, status: 'quote' });
    
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    doc.end();
});

// Modified server start code
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
    // Development server
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
} else {
    // Production (Vercel) - export the app
    module.exports = app;
} 