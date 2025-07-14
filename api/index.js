// api/index.js - Main entry point for Vercel deployment
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
// You'll need to set your Firebase service account credentials as environment variables
let firebaseApp;
try {
  // Parse the service account key from environment variable
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL // Optional: if you use Realtime Database
  });
  
  console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error);
}

const db = admin.firestore();

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: '🚀 Notification server is running!', 
    timestamp: new Date().toISOString(),
    status: 'healthy'
  });
});

// Get all staff/admin device tokens
async function getStaffTokens() {
  try {
    console.log('🔍 Fetching staff tokens from Firestore...');
    
    // Query users with role 'admin' or 'employee'
    const staffQuery = await db.collection('users')
      .where('role', 'in', ['admin', 'employee'])
      .get();

    const tokens = [];
    staffQuery.forEach(doc => {
      const userData = doc.data();
      if (userData.deviceToken) {
        tokens.push(userData.deviceToken);
        console.log(`📱 Found token for ${userData.role}: ${userData.deviceToken.substring(0, 20)}...`);
      }
    });

    console.log(`✅ Found ${tokens.length} staff tokens`);
    return tokens;
  } catch (error) {
    console.error('❌ Error fetching staff tokens:', error);
    return [];
  }
}

// Get customer device token
async function getCustomerToken(customerMobile) {
  try {
    console.log(`🔍 Fetching token for customer: ${customerMobile}`);
    
    const userDoc = await db.collection('users').doc(customerMobile).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData.deviceToken) {
        console.log(`📱 Found customer token: ${userData.deviceToken.substring(0, 20)}...`);
        return userData.deviceToken;
      }
    }
    
    console.log('❌ No token found for customer');
    return null;
  } catch (error) {
    console.error('❌ Error fetching customer token:', error);
    return null;
  }
}

// Send push notification
async function sendPushNotification(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) {
    console.log('❌ No tokens provided for notification');
    return { success: false, error: 'No tokens provided' };
  }

  try {
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      tokens: Array.isArray(tokens) ? tokens : [tokens]
    };

    console.log(`📤 Sending notification to ${message.tokens.length} devices`);
    console.log(`📋 Title: ${title}`);
    console.log(`📋 Body: ${body}`);

    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`✅ Notification sent successfully`);
    console.log(`📊 Success count: ${response.successCount}`);
    console.log(`📊 Failure count: ${response.failureCount}`);

    // Log any failures
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`❌ Failed to send to token ${idx}: ${resp.error}`);
        }
      });
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses
    };

  } catch (error) {
    console.error('❌ Error sending notification:', error);
    return { success: false, error: error.message };
  }
}

// 📦 Send new order notification to all staff
app.post('/send-order-notification', async (req, res) => {
  try {
    console.log('🔔 Received order notification request');
    console.log('📋 Request body:', req.body);

    const { customerName, customerMobile, orderTotal, orderId } = req.body;

    // Validate required fields
    if (!customerName || !customerMobile || !orderTotal || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerName, customerMobile, orderTotal, orderId'
      });
    }

    // Get all staff tokens
    const staffTokens = await getStaffTokens();
    
    if (staffTokens.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No staff members found with valid device tokens'
      });
    }

    // Prepare notification content
    const title = '🛒 New Order Received!';
    const body = `Order #${orderId}\nCustomer: ${customerName}\nPhone: ${customerMobile}\nTotal: ₹${orderTotal}`;
    
    const data = {
      type: 'new_order',
      orderId: orderId,
      customerName: customerName,
      customerMobile: customerMobile,
      orderTotal: orderTotal.toString(),
    };

    // Send notification
    const result = await sendPushNotification(staffTokens, title, body, data);

    if (result.success) {
      res.json({
        success: true,
        message: `Order notification sent to ${result.successCount} staff members`,
        details: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Error in send-order-notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

// 🚚 Send dispatch notification to customer
app.post('/send-dispatch-notification', async (req, res) => {
  try {
    console.log('🔔 Received dispatch notification request');
    console.log('📋 Request body:', req.body);

    const { customerMobile, orderId, customerName } = req.body;

    // Validate required fields
    if (!customerMobile || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerMobile, orderId'
      });
    }

    // Get customer token
    const customerToken = await getCustomerToken(customerMobile);
    
    if (!customerToken) {
      return res.status(404).json({
        success: false,
        error: 'Customer device token not found'
      });
    }

    // Prepare notification content
    const title = '🚚 Order Dispatched!';
    const body = `Great news ${customerName || 'Customer'}! Your order #${orderId} has been dispatched and is on its way to you.`;
    
    const data = {
      type: 'order_dispatched',
      orderId: orderId,
      customerMobile: customerMobile,
    };

    // Send notification
    const result = await sendPushNotification([customerToken], title, body, data);

    if (result.success) {
      res.json({
        success: true,
        message: 'Dispatch notification sent to customer',
        details: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Error in send-dispatch-notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

// ❌ Send cancellation notification to customer
app.post('/send-cancellation-notification', async (req, res) => {
  try {
    console.log('🔔 Received cancellation notification request');
    console.log('📋 Request body:', req.body);

    const { customerMobile, orderId, reason, customerName } = req.body;

    // Validate required fields
    if (!customerMobile || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerMobile, orderId'
      });
    }

    // Get customer token
    const customerToken = await getCustomerToken(customerMobile);
    
    if (!customerToken) {
      return res.status(404).json({
        success: false,
        error: 'Customer device token not found'
      });
    }

    // Prepare notification content
    const title = '❌ Order Cancelled';
    const body = `Sorry ${customerName || 'Customer'}, your order #${orderId} has been cancelled.${reason ? ` Reason: ${reason}` : ''} Please contact us for assistance.`;
    
    const data = {
      type: 'order_cancelled',
      orderId: orderId,
      customerMobile: customerMobile,
      reason: reason || '',
    };

    // Send notification
    const result = await sendPushNotification([customerToken], title, body, data);

    if (result.success) {
      res.json({
        success: true,
        message: 'Cancellation notification sent to customer',
        details: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Error in send-cancellation-notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

// 📢 Send custom notification (for admin use)
app.post('/send-custom-notification', async (req, res) => {
  try {
    console.log('🔔 Received custom notification request');
    
    const { recipients, title, body, data } = req.body;

    if (!recipients || !title || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: recipients, title, body'
      });
    }

    let tokens = [];

    // Handle different recipient types
    if (recipients === 'all_staff') {
      tokens = await getStaffTokens();
    } else if (recipients === 'all_customers') {
      // Get all customer tokens
      const customersQuery = await db.collection('users')
        .where('role', '==', 'customer')
        .get();
      
      customersQuery.forEach(doc => {
        const userData = doc.data();
        if (userData.deviceToken) {
          tokens.push(userData.deviceToken);
        }
      });
    } else if (Array.isArray(recipients)) {
      // Recipients is an array of mobile numbers
      for (const mobile of recipients) {
        const token = await getCustomerToken(mobile);
        if (token) tokens.push(token);
      }
    }

    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No valid recipients found'
      });
    }

    const result = await sendPushNotification(tokens, title, body, data || {});

    if (result.success) {
      res.json({
        success: true,
        message: `Custom notification sent to ${result.successCount} recipients`,
        details: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Error in send-custom-notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    firebase: firebaseApp ? 'connected' : 'disconnected'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /test',
      'GET /health',
      'POST /send-order-notification',
      'POST /send-dispatch-notification',
      'POST /send-cancellation-notification',
      'POST /send-custom-notification'
    ]
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Export for Vercel
module.exports = app;

// For local testing
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Test endpoint: http://localhost:${PORT}/test`);
  });
}