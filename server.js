require("dotenv").config();
const express = require("express");
const axios = require("axios");

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static("public"));

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).json({ status: true, message: "Server is running" });
});

// Initialize Transaction endpoint
app.post("/initialize-transaction", async (req, res) => {
  try {
    // Validate request body
    const { amount, email } = req.body;

    if (!amount || !email) {
      return res.status(400).json({
        status: false,
        message: "Both amount and email are required",
      });
    }

    // Ensure amount is a number
    if (isNaN(parseFloat(amount))) {
      return res.status(400).json({
        status: false,
        message: "Amount must be a valid number",
      });
    }

    // Validate email format using a simple regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: false,
        message: "Please provide a valid email address",
      });
    }

    // Initialize transaction with Paystack API
    const response = await axios.post(
      "https://api.paystack.co/preauthorization/initialize",
      {
        amount: parseFloat(amount) * 100, // Convert to kobo/cents
        email,
        currency: "ZAR",
        ...req.body
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Return the authorization URL and reference
    return res.status(200).json({
      status: true,
      data: {
        authorization_url: response.data.data.authorization_url,
        reference: response.data.data.reference,
      },
    });
  } catch (error) {
    console.error(
      "Error initializing transaction:",
      error.response?.data || error.message
    );

    // Return client-friendly error response
    return res.status(error.response?.status || 500).json({
      status: false,
      message:
        error.response?.data?.message || "Error initializing transaction",
      data: null,
    });
  }
});

// Transaction Callback route
app.get("/callback", async (req, res) => {
  try {
    // Get transaction reference from query parameters
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Transaction Failed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
            }
            .error-container {
              background-color: #fff8f8;
              border: 1px solid #f5c6cb;
              border-radius: 8px;
              padding: 20px;
              margin-top: 30px;
            }
            h1 {
              color: #dc3545;
            }
            .btn {
              display: inline-block;
              background-color: #007bff;
              color: white;
              text-decoration: none;
              padding: 10px 20px;
              border-radius: 4px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>Error</h1>
            <p>Transaction reference is missing. Unable to verify payment status.</p>
            <a href="javascript:history.back()" class="btn">Go Back</a>
          </div>
        </body>
        </html>
      `);
    }

    // Verify transaction with Paystack API
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { data } = response.data;
    const isSuccessful = data.status === "success";

    // Format amount from kobo/cents to main currency
    const formattedAmount = new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: data.currency || "NGN",
    }).format(data.amount / 100);

    // Return HTML response based on transaction status
    if (isSuccessful) {
      return res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
            }
            .success-container {
              background-color: #f8fff9;
              border: 1px solid #c3e6cb;
              border-radius: 8px;
              padding: 20px;
              margin-top: 30px;
            }
            h1 {
              color: #28a745;
            }
            .details {
              text-align: left;
              margin: 20px 0;
              background: #f9f9f9;
              padding: 15px;
              border-radius: 4px;
            }
            .detail-row {
              margin-bottom: 10px;
            }
            .btn {
              display: inline-block;
              background-color: #28a745;
              color: white;
              text-decoration: none;
              padding: 10px 20px;
              border-radius: 4px;
              margin-top: 20px;
            }
            .reference {
              font-family: monospace;
              background: #f0f0f0;
              padding: 5px;
              border-radius: 3px;
            }
          </style>
        </head>
        <body>
          <div class="success-container">
            <h1>Payment Successful</h1>
            <p>Your transaction has been completed successfully.</p>
            
            <div class="details">
              <div class="detail-row"><strong>Amount:</strong> ${formattedAmount}</div>
              <div class="detail-row"><strong>Email:</strong> ${
                data.customer.email
              }</div>
              <div class="detail-row"><strong>Transaction Reference:</strong> <span class="reference">${
                data.reference
              }</span></div>
              <div class="detail-row"><strong>Payment Method:</strong> ${
                data.channel || "Card"
              }</div>
              <div class="detail-row"><strong>Date:</strong> ${new Date(
                data.paid_at
              ).toLocaleString()}</div>
            </div>
            
            <p>Thank you for your payment!</p>
            <a href="javascript:window.close()" class="btn">Close</a>
          </div>
        </body>
        </html>
      `);
    } else {
      return res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Failed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
            }
            .failed-container {
              background-color: #fff8f8;
              border: 1px solid #f5c6cb;
              border-radius: 8px;
              padding: 20px;
              margin-top: 30px;
            }
            h1 {
              color: #dc3545;
            }
            .details {
              text-align: left;
              margin: 20px 0;
              background: #f9f9f9;
              padding: 15px;
              border-radius: 4px;
            }
            .detail-row {
              margin-bottom: 10px;
            }
            .btn {
              display: inline-block;
              background-color: #dc3545;
              color: white;
              text-decoration: none;
              padding: 10px 20px;
              border-radius: 4px;
              margin-top: 20px;
            }
            .reference {
              font-family: monospace;
              background: #f0f0f0;
              padding: 5px;
              border-radius: 3px;
            }
          </style>
        </head>
        <body>
          <div class="failed-container">
            <h1>Payment Failed</h1>
            <p>Your transaction could not be completed.</p>
            
            <div class="details">
              <div class="detail-row"><strong>Reference:</strong> <span class="reference">${
                data.reference
              }</span></div>
              <div class="detail-row"><strong>Status:</strong> ${
                data.status
              }</div>
              <div class="detail-row"><strong>Gateway Response:</strong> ${
                data.gateway_response || "Unknown error"
              }</div>
            </div>
            
            <p>Please try again or contact support if the problem persists.</p>
            <a href="javascript:history.back()" class="btn">Try Again</a>
          </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error(
      "Error verifying transaction:",
      error.response?.data || error.message
    );

    // Return error HTML page
    return res.status(error.response?.status || 500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            text-align: center;
          }
          .error-container {
            background-color: #fff8f8;
            border: 1px solid #f5c6cb;
            border-radius: 8px;
            padding: 20px;
            margin-top: 30px;
          }
          h1 {
            color: #dc3545;
          }
          .message {
            background: #f9f9f9;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
            text-align: left;
          }
          .btn {
            display: inline-block;
            background-color: #6c757d;
            color: white;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 4px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>Verification Error</h1>
          <p>We couldn't verify your payment status at this time.</p>
          
          <div class="message">
            <strong>Error:</strong> ${
              error.response?.data?.message ||
              error.message ||
              "Unknown error occurred"
            }
          </div>
          
          <p>Please contact support with your transaction reference.</p>
          <a href="javascript:history.back()" class="btn">Go Back</a>
        </div>
      </body>
      </html>
    `);
  }
});

app.get("/verify", async (req, res) => {
  const { reference } = req.query;

  if (!reference) {
    return res.status(400).json({
      status: false,
      message: "Transaction reference is required",
    });
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = response.data.data;

    return res.status(200).json({
      status: true,
      data: {
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        email: data.customer?.email,
        channel: data.channel,
        paid_at: data.paid_at,
        gateway_response: data.gateway_response,
      },
    });
  } catch (error) {
    console.error(
      "Error verifying transaction:",
      error.response?.data || error.message
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Error verifying transaction",
      error: error.response?.data || error.message,
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
