const mongoose = require('mongoose');

const connectDB = async () => {
  // Fail fast with a clear message if MONGO_URI is missing
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in your .env file.');
    console.error('   Copy .env.example → .env and fill in your Atlas connection string.');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 10000, // wait up to 10s before giving up
      socketTimeoutMS: 45000,
      family: 4, // force IPv4 — avoids DNS issues on some systems
    });

    console.log(`✅ MongoDB Atlas connected: ${conn.connection.host}`);

    // Post-connect event listeners (log only — Mongoose auto-reconnects)
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB runtime error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected — Mongoose will retry automatically');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

  } catch (err) {
    // Surface actionable error messages
    console.error('\n❌ MongoDB connection failed:', err.message);

    if (err.message.includes('bad auth') || err.message.includes('Authentication failed')) {
      console.error('   → Wrong username or password in MONGO_URI');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      console.error('   → Cannot reach Atlas. Check your cluster hostname and Network Access IP whitelist.');
    } else if (err.message.includes('timed out')) {
      console.error('   → Connection timed out. Make sure 0.0.0.0/0 is whitelisted in Atlas → Network Access.');
    }

    console.error('\nFix your .env MONGO_URI and restart.\n');
    process.exit(1); // Hard exit — do NOT start accepting requests without a DB
  }
};

module.exports = connectDB;
