namespace Client_app.Services
{
    /// <summary>
    /// A service for handling authentication token generation for Fabric CA.
    /// </summary>
    public interface IFabricCaAuthService
    {
        string GenerateAuthToken(string method, string uri, string body);
    }
}