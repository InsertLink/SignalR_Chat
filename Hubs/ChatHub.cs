using Microsoft.AspNetCore.SignalR;

namespace SignalR.Hubs;

public class ChatHub : Hub
{
    
    // remember to check rooms clients.group
    public async Task SendMessage(string user, string message)
    {
        await Clients.All.SendAsync("ReceiveMessage", user, message);
    }
}