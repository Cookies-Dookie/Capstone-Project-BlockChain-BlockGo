using BlockGo.Services;
using Microsoft.EntityFrameworkCore;
using Client_app.Services;
using Client_app.Models;
using For_Testing_Only_Capstone.Models;
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.AllowAnyOrigin()  // For production, replace this with actual frontend URL
              .AllowAnyMethod() 
              .AllowAnyHeader(); 
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddHttpClient<IBlockchainService, BlockchainService>();
builder.Services.AddScoped<IFabricCaAuthService, FabricCaAuthService>();

builder.Services.AddHttpClient("FabricCAClient")
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
    {
        ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator // For development only
    });


builder.Services.AddDbContext<RegistrarDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? "Host=127.0.0.1;Database=AcitivityLogs;Username=BLOCKGO;Password=PLVBLOCKGO"));

var app = builder.Build();

app.UseSwagger()
;app.UseSwaggerUI();


app.UseCors("AllowFrontend");

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();