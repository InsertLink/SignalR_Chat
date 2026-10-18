using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace SignalR.Hubs;

public class ChatHub : Hub
{
    private static readonly ConcurrentDictionary<string, string> Users = new();

    public async Task RegisterUser(string user)
    {
        var name = (user ?? string.Empty).Trim();

        if (name.Length == 0)
            throw new HubException("A username is required.");

        if (name.Length > 30)
            throw new HubException("Username must be 30 characters or fewer.");

        var isNew = !Users.ContainsKey(Context.ConnectionId);
        Users[Context.ConnectionId] = name;

        if (isNew)
            await Clients.Others.SendAsync("UserJoined", name);
    }

    public async Task SendMessage(string message)
    {
        // No entry in Users → this connection never registered → reject.
        if (!Users.TryGetValue(Context.ConnectionId, out var user))
            throw new HubException("You must register a username before sending messages.");

        var text = (message ?? string.Empty).Trim();
        if (text.Length == 0) return;

        await Clients.All.SendAsync("ReceiveMessage", user, text);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Users.TryRemove(Context.ConnectionId, out var name))
            await Clients.Others.SendAsync("UserLeft", name);

        await base.OnDisconnectedAsync(exception);
    }
}