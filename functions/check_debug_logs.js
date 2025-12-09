const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function checkDebugLogs() {
    console.log('Checking system_debug_logs...');
    try {
        const snapshot = await db.collection('system_debug_logs')
            .limit(5)
            .orderBy('timestamp', 'desc') // timestamp for main logic, startedAt for helper
            .get();

        // Fallback if index issue
        if (snapshot.empty) {
            const snap2 = await db.collection('system_debug_logs').limit(5).get();
            snap2.forEach(doc => {
                console.log(`\n=== DOCUMENT ID: ${doc.id} ===`);
                console.log(JSON.stringify(doc.data(), null, 2));
            });
            return;
        }

        snapshot.forEach(doc => {
            console.log(`\n=== DOCUMENT ID: ${doc.id} ===`);
            console.log(JSON.stringify(doc.data(), null, 2));
        });

    } catch (error) {
        // If orderBy fails due to missing index, just get latest without sort (approx)
        console.log('Sort failed, getting recent docs without sort...');
        const snapshot = await db.collection('system_debug_logs').limit(5).get();
        snapshot.forEach(doc => {
            console.log(`\n=== DOCUMENT ID: ${doc.id} ===`);
            console.log(JSON.stringify(doc.data(), null, 2));
        });
    }
}

checkDebugLogs();
