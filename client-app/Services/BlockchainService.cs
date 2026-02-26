using BlockGo.Models;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;

namespace BlockGo.Services
{
    public class BlockchainService : IBlockchainService
    {
        private readonly HttpClient _httpClient;

        public BlockchainService(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }
        public async Task<string> GetAllGradesAsync()
        {
            var response = await _httpClient.GetAsync("http://localhost:3000/api/all-grades");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }
        public async Task<string> GetGradeAsync(string recordId)
        {
            var response = await _httpClient.GetAsync($"http://localhost:3000/api/get-grade/{recordId}");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }
        public async Task<string> SubmitGradeAsync(GradeRequest request)
        {
            var response = await _httpClient.PostAsJsonAsync("http://localhost:3000/api/record-grade", request);

            response.EnsureSuccessStatusCode();

            return await response.Content.ReadAsStringAsync();
        }
    }
}