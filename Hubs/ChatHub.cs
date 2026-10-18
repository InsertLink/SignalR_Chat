using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace SignalR.Hubs;

public class ChatHub : Hub
{
    private sealed record UserInfo(string Name, string Room);
    private static readonly ConcurrentDictionary<string, UserInfo> Users = new();
    private const string DefaultRoom = "General";

    public async Task RegisterUser(string user, string room)
    {
        if (Users.ContainsKey(Context.ConnectionId))
            throw new HubException("You are already registered.");

        var name = ValidateName(user);
        var roomName = ValidateRoom(room);

        Users[Context.ConnectionId] = new UserInfo(name, roomName);
        await Groups.AddToGroupAsync(Context.ConnectionId, roomName);
        await Clients.OthersInGroup(roomName).SendAsync("UserJoined", name, roomName);
    }

    public async Task ChangeRoom(string room)
    {
        if (!Users.TryGetValue(Context.ConnectionId, out var info))
            throw new HubException("Register before changing rooms.");

        var roomName = ValidateRoom(room);
        if (roomName == info.Room) return;

        // Atomic dictionary update first, so concurrent calls see the new room.
        if (!Users.TryUpdate(Context.ConnectionId, info with { Room = roomName }, info))
            throw new HubException("Could not change room. Please try again.");

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, info.Room);
        await Clients.OthersInGroup(info.Room).SendAsync("UserLeft", info.Name, info.Room);

        await Groups.AddToGroupAsync(Context.ConnectionId, roomName);
        await Clients.OthersInGroup(roomName).SendAsync("UserJoined", info.Name, roomName);

        await Clients.Caller.SendAsync("RoomChanged", roomName);
    }

    public async Task SendMessage(string message)
    {
        if (!Users.TryGetValue(Context.ConnectionId, out var info))
            throw new HubException("You must register a username before sending messages.");

        var text = (message ?? string.Empty).Trim();
        if (text.Length == 0) return;

        await Clients.Group(info.Room).SendAsync("ReceiveMessage", info.Name, text, info.Room);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Users.TryRemove(Context.ConnectionId, out var info))
            await Clients.OthersInGroup(info.Room).SendAsync("UserLeft", info.Name, info.Room);

        await base.OnDisconnectedAsync(exception);
    }

    private static string ValidateName(string user)
    {
        var name = (user ?? string.Empty).Trim();
        if (name.Length == 0) throw new HubException("A username is required.");
        if (name.Length > 30) throw new HubException("Username must be 30 characters or fewer.");
        return name;
    }

    private static string ValidateRoom(string room)
    {
        var name = (room ?? string.Empty).Trim();
        if (name.Length == 0) return DefaultRoom;
        if (name.Length > 30) throw new HubException("Room name must be 30 characters or fewer.");
        return name;
    }
}