-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AGENT', 'BROKER', 'LENDER', 'INVESTOR', 'DEVELOPER', 'WHOLESALER');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('FOR_SALE', 'FOR_LEASE', 'OFF_MARKET');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'PENDING', 'SOLD', 'EXPIRED', 'WITHDRAWN', 'UNDER_CONTRACT');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('COMMERCIAL', 'RESIDENTIAL', 'LAND');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('PIPELINE', 'ACTIVE', 'UNDERWRITING', 'PENDING', 'CLOSED', 'HOLD');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "licenseNumber" TEXT,
    "bio" TEXT,
    "avatar" TEXT,
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "county" TEXT,
    "apn" TEXT,
    "legalDesc" TEXT,
    "propertyType" TEXT,
    "size" DOUBLE PRECISION,
    "sizeUnit" TEXT,
    "zoning" TEXT,
    "yearBuilt" INTEGER,
    "assessedValue" DOUBLE PRECISION,
    "marketValue" DOUBLE PRECISION,
    "ownerName" TEXT,
    "ownerAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acres" DOUBLE PRECISION,
    "centroid" JSONB,
    "impValue" DOUBLE PRECISION,
    "isAbsentee" BOOLEAN NOT NULL DEFAULT false,
    "isTaxDelinquent" BOOLEAN NOT NULL DEFAULT false,
    "isVacantLand" BOOLEAN NOT NULL DEFAULT false,
    "landValue" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "mailingAddr" TEXT,
    "mktValue" DOUBLE PRECISION,
    "motivationScore" INTEGER,
    "opportunityFlags" TEXT[],
    "owner" TEXT,
    "parcelId" TEXT NOT NULL,
    "siteAddress" TEXT,
    "taxYear" INTEGER,
    "totalDue" DOUBLE PRECISION,
    "totalTax" DOUBLE PRECISION,
    "siteCity" TEXT,
    "siteState" TEXT,
    "siteZip" TEXT,
    "appraisedValue" DOUBLE PRECISION,
    "block" TEXT,
    "deedDate" TEXT,
    "enrichedAt" TIMESTAMP(3),
    "enrichmentSource" TEXT,
    "floodZone" TEXT,
    "geoId" TEXT,
    "landTypeDesc" TEXT,
    "lot" TEXT,
    "ownerFirstName" TEXT,
    "ownerLastName" TEXT,
    "situsNum" TEXT,
    "situsStreet" TEXT,
    "subdivision" TEXT,
    "tcadAcres" DOUBLE PRECISION,
    "attomId" TEXT,
    "avmValue" DECIMAL(14,2),
    "avmMin" DECIMAL(14,2),
    "avmMax" DECIMAL(14,2),
    "avmConfidence" INTEGER,
    "avmDate" TIMESTAMP(3),
    "lastSaleDate" TIMESTAMP(3),
    "lastSaleAmount" DOUBLE PRECISION,
    "lastSaleDocType" TEXT,
    "grantorName" TEXT,
    "granteeName" TEXT,
    "granteeMailAddress" TEXT,
    "granteeMailCity" TEXT,
    "granteeMailState" TEXT,
    "granteeMailZip" TEXT,
    "isInvestorOwned" BOOLEAN NOT NULL DEFAULT false,
    "isForeclosure" BOOLEAN NOT NULL DEFAULT false,
    "mortgageAmount" DOUBLE PRECISION,
    "mortgageLender" TEXT,
    "mortgageRate" DOUBLE PRECISION,
    "mortgageTerm" INTEGER,
    "ownershipYears" DOUBLE PRECISION,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "propertyType" "PropertyType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'TX',
    "zipCode" TEXT NOT NULL,
    "county" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "apn" TEXT,
    "askingPrice" DECIMAL(15,2) NOT NULL,
    "pricePerSqft" DECIMAL(10,2),
    "pricePerAcre" DECIMAL(15,2),
    "totalSqft" INTEGER,
    "lotSizeAcres" DECIMAL(10,4),
    "lotSizeSqft" INTEGER,
    "yearBuilt" INTEGER,
    "zoning" TEXT,
    "assetType" TEXT,
    "assetSubtype" TEXT,
    "noi" DECIMAL(15,2),
    "capRate" DECIMAL(5,2),
    "occupancy" DECIMAL(5,2),
    "tenantCount" INTEGER,
    "buildingCount" INTEGER,
    "floors" INTEGER,
    "parkingSpaces" INTEGER,
    "leaseType" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" DECIMAL(3,1),
    "hoaFee" DECIMAL(10,2),
    "totalAcres" DECIMAL(10,4),
    "numberOfLots" INTEGER,
    "roadFrontage" INTEGER,
    "topography" TEXT,
    "utilities" JSONB,
    "entitlements" TEXT,
    "images" JSONB,
    "documents" JSONB,
    "coverImage" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "inquiries" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "propertyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT,
    "title" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'PIPELINE',
    "dealType" TEXT,
    "purchasePrice" DOUBLE PRECISION,
    "offerPrice" DOUBLE PRECISION,
    "closingDate" TIMESTAMP(3),
    "seller" TEXT,
    "buyer" TEXT,
    "probability" INTEGER,
    "lostReason" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buy_boxes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "markets" JSONB,
    "counties" JSONB,
    "propertyTypes" JSONB,
    "minSize" DOUBLE PRECISION,
    "maxSize" DOUBLE PRECISION,
    "sizeUnit" TEXT,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "minCap" DOUBLE PRECISION,
    "maxCap" DOUBLE PRECISION,
    "zoning" JSONB,
    "minYearBuilt" INTEGER,
    "filters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buy_boxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealId" TEXT,
    "filename" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealId" TEXT,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comps" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "sizeUnit" TEXT NOT NULL,
    "salePrice" DOUBLE PRECISION NOT NULL,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "capRate" DOUBLE PRECISION,
    "noi" DOUBLE PRECISION,
    "distance" DOUBLE PRECISION,
    "source" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gis_layers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "style" JSONB,
    "minZoom" DOUBLE PRECISION,
    "maxZoom" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gis_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pins" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "title" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "summary" TEXT,
    "tags" JSONB,
    "pinType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_server_registry" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "context" TEXT,
    "datasetType" TEXT,
    "datasetCategory" TEXT,
    "serviceName" TEXT,
    "layerId" INTEGER,
    "geometryType" TEXT,
    "fields" JSONB,
    "extent" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastQueried" TIMESTAMP(3),
    "queryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_server_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layer_sets" (
    "id" TEXT NOT NULL,
    "layerSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "geometryType" TEXT NOT NULL,
    "style" JSONB NOT NULL,
    "primaryLayerUrl" TEXT NOT NULL,
    "primaryLayerId" TEXT,
    "alternativeLayers" JSONB,
    "totalFeatureCount" INTEGER NOT NULL DEFAULT 0,
    "layerCount" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "queryCount" INTEGER NOT NULL DEFAULT 0,
    "lastQueried" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layer_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_queries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "selectedServers" JSONB NOT NULL,
    "bounds" JSONB,
    "results" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polygon_searches" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "polygonGeoJSON" JSONB NOT NULL,
    "areaAcres" DOUBLE PRECISION,
    "centroidLat" DOUBLE PRECISION,
    "centroidLng" DOUBLE PRECISION,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "filters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "polygon_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "properties_parcelId_key" ON "properties"("parcelId");

-- CreateIndex
CREATE INDEX "properties_propertyType_idx" ON "properties"("propertyType");

-- CreateIndex
CREATE INDEX "properties_latitude_longitude_idx" ON "properties"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "properties_isAbsentee_idx" ON "properties"("isAbsentee");

-- CreateIndex
CREATE INDEX "properties_isTaxDelinquent_idx" ON "properties"("isTaxDelinquent");

-- CreateIndex
CREATE INDEX "properties_motivationScore_idx" ON "properties"("motivationScore");

-- CreateIndex
CREATE INDEX "properties_acres_idx" ON "properties"("acres");

-- CreateIndex
CREATE INDEX "properties_totalTax_idx" ON "properties"("totalTax");

-- CreateIndex
CREATE INDEX "properties_parcelId_idx" ON "properties"("parcelId");

-- CreateIndex
CREATE INDEX "properties_attomId_idx" ON "properties"("attomId");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "listings_propertyType_idx" ON "listings"("propertyType");

-- CreateIndex
CREATE INDEX "listings_city_idx" ON "listings"("city");

-- CreateIndex
CREATE INDEX "listings_askingPrice_idx" ON "listings"("askingPrice");

-- CreateIndex
CREATE INDEX "deals_userId_stage_idx" ON "deals"("userId", "stage");

-- CreateIndex
CREATE INDEX "deals_stage_idx" ON "deals"("stage");

-- CreateIndex
CREATE INDEX "buy_boxes_userId_idx" ON "buy_boxes"("userId");

-- CreateIndex
CREATE INDEX "documents_userId_idx" ON "documents"("userId");

-- CreateIndex
CREATE INDEX "documents_dealId_idx" ON "documents"("dealId");

-- CreateIndex
CREATE INDEX "activities_userId_idx" ON "activities"("userId");

-- CreateIndex
CREATE INDEX "activities_dealId_idx" ON "activities"("dealId");

-- CreateIndex
CREATE INDEX "tasks_userId_status_idx" ON "tasks"("userId", "status");

-- CreateIndex
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

-- CreateIndex
CREATE INDEX "comps_city_state_propertyType_idx" ON "comps"("city", "state", "propertyType");

-- CreateIndex
CREATE INDEX "pins_lat_lng_idx" ON "pins"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "map_server_registry_url_key" ON "map_server_registry"("url");

-- CreateIndex
CREATE INDEX "map_server_registry_category_idx" ON "map_server_registry"("category");

-- CreateIndex
CREATE INDEX "map_server_registry_datasetType_idx" ON "map_server_registry"("datasetType");

-- CreateIndex
CREATE INDEX "map_server_registry_isActive_category_idx" ON "map_server_registry"("isActive", "category");

-- CreateIndex
CREATE UNIQUE INDEX "layer_sets_layerSetId_key" ON "layer_sets"("layerSetId");

-- CreateIndex
CREATE INDEX "layer_sets_category_idx" ON "layer_sets"("category");

-- CreateIndex
CREATE INDEX "layer_sets_geometryType_idx" ON "layer_sets"("geometryType");

-- CreateIndex
CREATE INDEX "layer_sets_isActive_category_idx" ON "layer_sets"("isActive", "category");

-- CreateIndex
CREATE INDEX "map_queries_userId_idx" ON "map_queries"("userId");

-- CreateIndex
CREATE INDEX "map_queries_createdAt_idx" ON "map_queries"("createdAt");

-- CreateIndex
CREATE INDEX "polygon_searches_userId_idx" ON "polygon_searches"("userId");

-- CreateIndex
CREATE INDEX "polygon_searches_updatedAt_idx" ON "polygon_searches"("updatedAt");

-- CreateIndex
CREATE INDEX "polygon_searches_lastAccessedAt_idx" ON "polygon_searches"("lastAccessedAt");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buy_boxes" ADD CONSTRAINT "buy_boxes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comps" ADD CONSTRAINT "comps_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pins" ADD CONSTRAINT "pins_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_queries" ADD CONSTRAINT "map_queries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

