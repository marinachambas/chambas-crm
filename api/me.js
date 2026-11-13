const { send } = require("../lib/auth");
module.exports = async (req, res) => send(res, 200, { email:"equipo", name:"Equipo" });
