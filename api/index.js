// api/index.js - Fixed version with admin_and_employees support
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
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
    const userDetails = [];
    
    staffQuery.forEach(doc => {
      const userData = doc.data();
      console.log(`👤 Found ${userData.role}: ${userData.name} (${userData.mobileNumber})`);
      
      if (userData.deviceToken && userData.deviceToken.trim() !== '') {
        tokens.push(userData.deviceToken);
        userDetails.push(`${userData.role}: ${userData.name} (${userData.mobileNumber})`);
        console.log(`📱 ✅ Added token for ${userData.role}: ${userData.deviceToken.substring(0, 20)}...`);
      } else {
        console.log(`📱 ❌ No device token for ${userData.role}: ${userData.name}`);
      }
    });

    console.log(`✅ Found ${tokens.length} valid staff tokens out of ${staffQuery.docs.length} staff members`);
    return { tokens, userDetails };
  } catch (error) {
    console.error('❌ Error fetching staff tokens:', error);
    return { tokens: [], userDetails: [] };
  }
}

// NEW: Get admin and employee tokens specifically
async function getAdminAndEmployeeTokens() {
  try {
    console.log('🔍 Fetching admin and employee tokens from Firestore...');
    
    const tokens = [];
    const userDetails = [];
    
    // Get admin users
    console.log('📋 Searching for admin users...');
    const adminQuery = await db.collection('users')
      .where('role', '==', 'admin')
      .get();
    
    console.log(`📋 Found ${adminQuery.docs.length} admin users`);
    
    adminQuery.forEach(doc => {
      const userData = doc.data();
      console.log(`👤 Admin: ${userData.name} (${userData.mobileNumber})`);
      
      if (userData.deviceToken && userData.deviceToken.trim() !== '') {
        tokens.push(userData.deviceToken);
        userDetails.push(`Admin: ${userData.name} (${userData.mobileNumber})`);
        console.log(`📱 ✅ Added admin token: ${userData.deviceToken.substring(0, 20)}...`);
      } else {
        console.log(`📱 ❌ Admin ${userData.name} has no device token`);
      }
    });

    // Get employee users
    console.log('📋 Searching for employee users...');
    const employeeQuery = await db.collection('users')
      .where('role', '==', 'employee')
      .get();
    
    console.log(`📋 Found ${employeeQuery.docs.length} employee users`);
    
    employeeQuery.forEach(doc => {
      const userData = doc.data();
      console.log(`👤 Employee: ${userData.name} (${userData.mobileNumber})`);
      
      if (userData.deviceToken && userData.deviceToken.trim() !== '') {
        tokens.push(userData.deviceToken);
        userDetails.push(`Employee: ${userData.name} (${userData.mobileNumber})`);
        console.log(`📱 ✅ Added employee token: ${userData.deviceToken.substring(0, 20)}...`);
      } else {
        console.log(`📱 ❌ Employee ${userData.name} has no device token`);
      }
    });

    console.log(`✅ Total admin/employee tokens collected: ${tokens.length}`);
    console.log(`📋 Recipients: ${userDetails.join(', ')}`);
    
    return { tokens, userDetails, adminCount: adminQuery.docs.length, employeeCount: employeeQuery.docs.length };
  } catch (error) {
    console.error('❌ Error fetching admin/employee tokens:', error);
    return { tokens: [], userDetails: [], adminCount: 0, employeeCount: 0 };
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
    console.log(`📋 Body: ${body.substring(0, 100)}...`);

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
    const { tokens: staffTokens, userDetails } = await getStaffTokens();
    
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
        recipients: userDetails,
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
// 🚚 Send enhanced dispatch notification with travel details to customer
app.post('/send-dispatch-notification-with-details', async (req, res) => {
  try {
    console.log('🔔 Received enhanced dispatch notification request');
    console.log('📋 Request body:', req.body);

    const { customerMobile, orderId, customerName, travelCompany, trackingNumber } = req.body;

    // Validate required fields
    if (!customerMobile || !orderId || !travelCompany || !trackingNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerMobile, orderId, travelCompany, trackingNumber'
      });
    }

    // Get customer token
    const customerToken = await getCustomerToken(customerMobile);
    
    if (!customerToken) {
      console.log(`❌ No device token found for customer: ${customerMobile}`);
      return res.status(404).json({
        success: false,
        error: 'Customer device token not found',
        details: `No valid device token found for mobile number: ${customerMobile}`
      });
    }

    // Prepare enhanced notification content with travel details
    const shortOrderId = orderId;
    const title = '📦 Order Dispatched!';
    const body = `Great news ${customerName || 'Customer'}! Your order #${shortOrderId} has been dispatched via ${travelCompany}.\n\nTracking Number: ${trackingNumber}\n\nYou can track your package using this number.`;
    
    const data = {
      type: 'order_dispatched_with_details',
      orderId: orderId,
      customerMobile: customerMobile,
      travelCompany: travelCompany,
      trackingNumber: trackingNumber,
      shortOrderId: shortOrderId,
    };

    console.log(`📦 Sending enhanced dispatch notification:`);
    console.log(`👤 Customer: ${customerName || 'Customer'} (${customerMobile})`);
    console.log(`📋 Order: #${shortOrderId}`);
    console.log(`🚚 Travel Company: ${travelCompany}`);
    console.log(`📦 Tracking: ${trackingNumber}`);

    // Send notification
    const result = await sendPushNotification([customerToken], title, body, data);

    if (result.success) {
      console.log('✅ Enhanced dispatch notification sent successfully');
      res.json({
        success: true,
        message: `Enhanced dispatch notification sent to ${customerName || customerMobile}`,
        travelDetails: {
          company: travelCompany,
          tracking: trackingNumber
        },
        details: result
      });
    } else {
      console.log('❌ Failed to send enhanced dispatch notification');
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Error in send-dispatch-notification-with-details:', error);
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

// 📢 Send custom notification (FIXED to handle admin_and_employees)
app.post('/send-custom-notification', async (req, res) => {
  try {
    console.log('🔔 Received custom notification request');
    console.log('📋 Recipients type:', req.body.recipients);
    console.log('📋 Title:', req.body.title);
    
    const { recipients, title, body, data } = req.body;

    if (!recipients || !title || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: recipients, title, body'
      });
    }

    let tokens = [];
    let userDetails = [];
    let recipientInfo = {};

    // Handle different recipient types
    if (recipients === 'admin_and_employees') {
      console.log('🎯 Getting admin and employee tokens...');
      const result = await getAdminAndEmployeeTokens();
      tokens = result.tokens;
      userDetails = result.userDetails;
      recipientInfo = {
        type: 'admin_and_employees',
        adminCount: result.adminCount,
        employeeCount: result.employeeCount,
        totalWithTokens: tokens.length
      };
      
    } else if (recipients === 'all_staff') {
      console.log('🎯 Getting all staff tokens...');
      const result = await getStaffTokens();
      tokens = result.tokens;
      userDetails = result.userDetails;
      recipientInfo = { type: 'all_staff', totalWithTokens: tokens.length };
      
    } else if (recipients === 'all_customers') {
      console.log('🎯 Getting all customer tokens...');
      // Get all customer tokens
      const customersQuery = await db.collection('users')
        .where('role', '==', 'customer')
        .get();
      
      customersQuery.forEach(doc => {
        const userData = doc.data();
        if (userData.deviceToken) {
          tokens.push(userData.deviceToken);
          userDetails.push(`Customer: ${userData.name} (${userData.mobileNumber})`);
        }
      });
      recipientInfo = { type: 'all_customers', totalWithTokens: tokens.length };
      
    } else if (Array.isArray(recipients)) {
      console.log('🎯 Getting tokens for specific mobile numbers...');
      // Recipients is an array of mobile numbers
      for (const mobile of recipients) {
        const token = await getCustomerToken(mobile);
        if (token) {
          tokens.push(token);
          userDetails.push(`Mobile: ${mobile}`);
        }
      }
      recipientInfo = { type: 'specific_mobiles', totalWithTokens: tokens.length };
      
    } else if (typeof recipients === 'string' && recipients.length === 10) {
      console.log('🎯 Getting token for single mobile number...');
      // Single mobile number
      const token = await getCustomerToken(recipients);
      if (token) {
        tokens.push(token);
        userDetails.push(`Mobile: ${recipients}`);
      }
      recipientInfo = { type: 'single_mobile', totalWithTokens: tokens.length };
    }

    console.log(`📊 Total tokens collected: ${tokens.length}`);
    console.log(`📋 Recipients: ${userDetails.join(', ')}`);

    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No valid recipients found',
        details: 'No users found with valid device tokens for the specified recipient type',
        searchedFor: recipients,
        recipientInfo: recipientInfo
      });
    }

    const result = await sendPushNotification(tokens, title, body, data || {});

    if (result.success) {
      res.json({
        success: true,
        message: `Custom notification sent to ${result.successCount} recipients`,
        recipients: userDetails,
        recipientInfo: recipientInfo,
        details: {
          successCount: result.successCount,
          failureCount: result.failureCount,
          totalTokens: tokens.length
        }
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

// NEW: Debug endpoint to check admin/employee tokens
app.get('/check-admin-employee-tokens', async (req, res) => {
  try {
    console.log('🔍 Checking admin and employee tokens...');
    
    const results = {
      admins: [],
      employees: [],
      totalWithTokens: 0,
      totalWithoutTokens: 0
    };
    
    // Check admins
    const adminQuery = await db.collection('users').where('role', '==', 'admin').get();
    adminQuery.docs.forEach(doc => {
      const data = doc.data();
      const hasToken = data.deviceToken && data.deviceToken.trim() !== '';
      
      results.admins.push({
        name: data.name,
        mobile: data.mobileNumber,
        hasToken: hasToken,
        lastLogin: data.lastLoginAt?.toDate?.()?.toISOString() || 'Never'
      });
      
      if (hasToken) results.totalWithTokens++;
      else results.totalWithoutTokens++;
    });
    
    // Check employees
    const employeeQuery = await db.collection('users').where('role', '==', 'employee').get();
    employeeQuery.docs.forEach(doc => {
      const data = doc.data();
      const hasToken = data.deviceToken && data.deviceToken.trim() !== '';
      
      results.employees.push({
        name: data.name,
        mobile: data.mobileNumber,
        hasToken: hasToken,
        lastLogin: data.lastLoginAt?.toDate?.()?.toISOString() || 'Never'
      });
      
      if (hasToken) results.totalWithTokens++;
      else results.totalWithoutTokens++;
    });
    
    console.log(`📊 Token summary: ${results.totalWithTokens} with tokens, ${results.totalWithoutTokens} without`);
    
    res.json(results);
    
  } catch (error) {
    console.error('❌ Error checking tokens:', error);
    res.status(500).json({ error: error.message });
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
      'GET /check-admin-employee-tokens',
      'POST /send-order-notification',
      'POST /send-dispatch-notification',
      'POST /send-cancellation-notification',
      'POST /send-dispatch-notification-with-details',
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


