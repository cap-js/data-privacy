
module.exports = async srv => {
    const {Configuration} = srv.entities;

    srv.on('READ', Configuration, req => {
        req.reply({
            isBlockingEnabled: false
        })
    })
}