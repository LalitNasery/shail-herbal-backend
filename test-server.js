// test-server.js - Test script to verify your backend endpoints
const express = require('express');

// Test your deployed backend
async function testBackend() {
  const BASE_URL = 'https://your-vercel-app-name.vercel.app'; // Replace with your actual Vercel URL
  
  console.log('🧪 Testing notification backend...\n');

  try {
    // Test 1: Health check
    console.log('1️⃣ Testing health check...');
    const healthResponse = await fetch(`${BASE_URL}/test`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData);
    console.log('');

    // Test 2: Order notification
    console.log('2️⃣ Testing order notification...');
    const orderResponse = await fetch(`${BASE_URL}/send-order-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerName: 'Test Customer',
        customerMobile: '9999999999',
        orderTotal: 299.50,
        orderId: 'TEST_ORDER_123'
      })
    });
    const orderData = await orderResponse.json();
    console.log('📦 Order notification result:', orderData);
    console.log('');

    // Test 3: Dispatch notification
    console.log('3️⃣ Testing dispatch notification...');
    const dispatchResponse = await fetch(`${BASE_URL}/send-dispatch-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerMobile: '9999999999',
        orderId: 'TEST_ORDER_123',
        customerName: 'Test Customer'
      })
    });
    const dispatchData = await dispatchResponse.json();
    console.log('🚚 Dispatch notification result:', dispatchData);
    console.log('');

    // Test 4: Cancellation notification
    console.log('4️⃣ Testing cancellation notification...');
    const cancelResponse = await fetch(`${BASE_URL}/send-cancellation-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerMobile: '9999999999',
        orderId: 'TEST_ORDER_123',
        reason: 'Out of stock',
        customerName: 'Test Customer'
      })
    });
    const cancelData = await cancelResponse.json();
    console.log('❌ Cancellation notification result:', cancelData);
    console.log('');

    console.log('✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testBackend();
}

module.exports = { testBackend };