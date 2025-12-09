const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function listInvoices() {
    console.log('Listing guide_invoices...');
    try {
        const snapshot = await db.collection('guide_invoices').limit(5).get();

        if (snapshot.empty) {
            console.log('No documents found in guide_invoices.');
            return;
        }

        snapshot.forEach(doc => {
            console.log(`ID: ${doc.id}`);
            const data = doc.data();
            console.log(` - Status: ${data.status}`);
            console.log(` - officialInvoicePdfUrl: ${data.officialInvoicePdfUrl || 'MISSING'}`);
        });

    } catch (error) {
        console.error('Error listing documents:', error);
    }
}

listInvoices();
