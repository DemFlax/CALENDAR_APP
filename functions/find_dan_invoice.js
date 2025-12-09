const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function findDanInvoice() {
    console.log('Searching for DAN 2025-11 invoice...');
    try {
        const snapshot = await db.collection('guide_invoices')
            .where('month', '==', '2025-11')
            .where('guideName', '==', 'DAN')
            .get();

        if (snapshot.empty) {
            console.log('No invoices found for DAN in 2025-11');
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`\nID: ${doc.id}`);
            console.log(`Status: ${data.status}`);
            console.log(`officialInvoicePdfUrl: ${data.officialInvoicePdfUrl}`);
            // Print type to be sure
            console.log(`Type of Url: ${typeof data.officialInvoicePdfUrl}`);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

findDanInvoice();
