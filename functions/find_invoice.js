const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function findInvoice() {
    console.log('Searching for November 2025 invoices...');
    try {
        const snapshot = await db.collection('guide_invoices')
            .where('month', '==', '2025-11')
            .get();

        if (snapshot.empty) {
            console.log('No invoices found for 2025-11');
            return;
        }

        console.log(`Found ${snapshot.size} invoices.`);

        snapshot.forEach(doc => {
            const data = doc.data();
            // Filter for DAN or just show all to find him
            console.log(`\nID: ${doc.id}`);
            console.log(`Guide Name: ${data.guideName}`);
            console.log(`Status: ${data.status}`);
            console.log(`officialInvoicePdfUrl: ${data.officialInvoicePdfUrl || 'MISSING'}`);
            console.log('-------------------');
        });

    } catch (error) {
        console.error('Error searching documents:', error);
    }
}

findInvoice();
