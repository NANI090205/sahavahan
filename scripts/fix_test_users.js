require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const User = require('../models/User');
  
  // Check schema fields
  const schema = User.schema.paths;
  const verFields = Object.keys(schema).filter(k => k.toLowerCase().includes('verify') || k.toLowerCase().includes('email'));
  console.log('Email/Verify fields:', verFields.join(', '));
  
  // Update with correct field name using raw update
  const r1 = await User.updateOne({username:'testdrv_prod'}, {'$set':{isEmailVerified:true, emailVerified:true}});
  const r2 = await User.updateOne({username:'testpax_prod'}, {'$set':{isEmailVerified:true, emailVerified:true}});
  console.log('Updated driver:', r1.modifiedCount);
  console.log('Updated passenger:', r2.modifiedCount);
  
  // Verify
  const d = await User.findOne({username:'testdrv_prod'}).select('isEmailVerified emailVerified email');
  console.log('Driver state:', d?.isEmailVerified, d?.emailVerified, d?.email);
  
  const p = await User.findOne({username:'testpax_prod'}).select('isEmailVerified emailVerified email');
  console.log('Passenger state:', p?.isEmailVerified, p?.emailVerified, p?.email);
  
  mongoose.disconnect();
});
