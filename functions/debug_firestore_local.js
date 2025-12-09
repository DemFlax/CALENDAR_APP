const admin = require('firebase-admin');

// Initialize with application default credentials (assumes you are logged in via gcloud auth application-default login)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkInvoiceData() {
    const invoiceId = 'GYMsS3HicPbbSY1A1FSE_2025-11';
    console.log(`Checking invoice: ${invoiceId}`);

    try {
        const doc = await db.collection('guide_invoices').doc(invoiceId).get();

        if (!doc.exists) {
            console.log('❌ Invoice not found');
            return;
        }

        const data = doc.data();
        console.log('=== INVOICE DATA ===');
        console.log('Status:', data.status);
        console.log('officialInvoicePdfUrl:', data.officialInvoicePdfUrl);

        if (!data.officialInvoicePdfUrl) {
            console.log('⚠️ WARNING: officialInvoicePdfUrl is MISSING or empty');
        } else {
            console.log(`✅ officialInvoicePdfUrl found: "${data.officialInvoicePdfUrl}"`);
        }
    } catch (error) {
        console.error('Error fetching document:', error);
    }
}

checkInvoiceData();
