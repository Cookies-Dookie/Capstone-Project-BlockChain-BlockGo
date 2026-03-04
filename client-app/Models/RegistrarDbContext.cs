using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace For_Testing_Only_Capstone.Models;

public partial class RegistrarDbContext : DbContext
{
    public RegistrarDbContext()
    {
    }

    public RegistrarDbContext(DbContextOptions<RegistrarDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Gradecorrectionlog> Gradecorrectionlogs { get; set; }

    public virtual DbSet<Userrequest> Userrequests { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        if (!optionsBuilder.IsConfigured)
        {
            optionsBuilder.UseNpgsql("Host=127.0.0.1;Database=AcitivityLogs;Username=BLOCKGO;Password=PLVBLOCKGO");
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Gradecorrectionlog>(entity =>
        {
            entity.HasKey(e => e.Logid).HasName("gradecorrectionlogs_pkey");

            entity.ToTable("gradecorrectionlogs");

            entity.Property(e => e.Logid).HasColumnName("logid");
            entity.Property(e => e.Approvedby)
                .HasMaxLength(100)
                .HasColumnName("approvedby");
            entity.Property(e => e.Newgrade)
                .HasMaxLength(10)
                .HasColumnName("newgrade");
            entity.Property(e => e.Oldgrade)
                .HasMaxLength(10)
                .HasColumnName("oldgrade");
            entity.Property(e => e.Reasontext).HasColumnName("reasontext");
            entity.Property(e => e.Recordid)
                .HasMaxLength(100)
                .HasColumnName("recordid");
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("timestamp");
        });

        modelBuilder.Entity<Userrequest>(entity =>
        {
            entity.HasKey(e => e.Requestid).HasName("userrequests_pkey");

            entity.ToTable("userrequests");

            entity.HasIndex(e => e.Email, "userrequests_email_key").IsUnique();

            entity.Property(e => e.Requestid).HasColumnName("requestid");
            entity.Property(e => e.Createdat)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("createdat");
            entity.Property(e => e.Email)
                .HasMaxLength(100)
                .HasColumnName("email");
            entity.Property(e => e.Fullname)
                .HasMaxLength(100)
                .HasColumnName("fullname");
            entity.Property(e => e.Requeststatus)
                .HasMaxLength(20)
                .HasDefaultValueSql("'PENDING'::character varying")
                .HasColumnName("requeststatus");
            entity.Property(e => e.Role)
                .HasMaxLength(20)
                .HasColumnName("role");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
