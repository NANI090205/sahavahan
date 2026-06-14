const express = require("express");
const router = express.Router();

const axios = require("axios");

router.get(
"/:city",
async(req,res)=>{

try{

const response =
await axios.get(

`https://api.openweathermap.org/data/2.5/weather?q=${req.params.city}&appid=${process.env.WEATHER_API_KEY}&units=metric`

);

res.json(response.data);

}catch(error){

res.status(500).json({
message:"Failed"
});

}

});

module.exports = router;