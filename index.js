const express = require('express')
const cors = require('cors')
const app = express() 
const port = process.env.PORT || 3000;

//middle ware
app.use(cors())
app.use(express.json())


app.get('/' ,(req,res) =>{
    res.send('user Parcel server')
})

app.listen(port,()=>{
    console.log(`server is running on ${port }`)
})