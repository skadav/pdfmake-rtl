var fonts = {
	Roboto: {
		normal: 'fonts/Roboto-Regular.ttf',
		bold: 'fonts/Roboto-Medium.ttf',
		italics: 'fonts/Roboto-Italic.ttf',
		bolditalics: 'fonts/Roboto-MediumItalic.ttf'
	},

	Nillima: {
		normal: 'fonts/Nillima.ttf',
		bold: 'fonts/Nillima.ttf',
		italics: 'fonts/Nillima.ttf',
		bolditalics: 'fonts/Nillima.ttf'
	}
};

var PdfPrinter = require('../src/printer');
var printer = new PdfPrinter(fonts);
var fs = require('fs');

// Example document with Arabic RTL support
var docDefinition = {
	// Document content
	content: [
		// Header
		{ 
			text: 'Arabic RTL Support Demo', 
			style: 'header',
			alignment: 'center',
			margin: [0, 0, 0, 20]
		},
		
		// LTR Text (English)
		{
			text: 'Left-to-Right (English) text: This is normal English text that flows from left to right.',
			margin: [0, 0, 0, 10]
		},
		// RTL Text (Arabic) with supportRTL enabled
		{
			text: 'هذا النص العربي يجب أن يظهر من اليمين إلى اليسار تلقائياً مع الخط العربي المناسب.',
			supportRTL: true,
			margin: [0, 0, 0, 10],
			font: 'Nillima'
		},
		{
			text: 'فحص مستوى سائل التبريد(زيت)', 
			supportRTL: true,
			margin: [0, 0, 0, 10],
			font: 'Nillima'
		},
		{
			text: 'فحص نظام (التكييف) والتدفئة',
			supportRTL: true,
			margin: [0, 0, 0, 10],
			font: 'Nillima'
		},
		{
			text: 'فحص البطارية (Battery Condition) {Voltage Test} [12.5V] <نتيجة طبيعية>.',
			supportRTL: true,
			margin: [0, 0, 0, 10],
			font: 'Nillima'
		},
	],
	
	// Styles
	styles: {
		header: {
			fontSize: 18,
			bold: true
		},
		subheader: {
			fontSize: 14,
			bold: true
		},
		tableHeader: {
			bold: true,
			fontSize: 13,
			alignment: 'center',
			fillColor: '#CCCCCC'
		}
	},
	
	// Default style
	defaultStyle: {
		fontSize: 12,
		lineHeight: 1.5,
		font: 'IBMPlexSansArabic'
	}
};

var now = new Date();

var pdfDoc = printer.createPdfKitDocument(docDefinition);
pdfDoc.pipe(fs.createWriteStream('examples/pdfs/arabic_rtl-oto.pdf'));
pdfDoc.end();

