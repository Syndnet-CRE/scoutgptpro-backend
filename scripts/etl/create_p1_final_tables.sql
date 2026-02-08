-- ATTOM P1 Final Tables Migration
-- Creates the last 3 ATTOM tables for Travis County
-- Climate Change Risk, Flood Zones, Building Permits

-- Table 1: Climate Change Risk Data
DROP TABLE IF EXISTS attom_climate_change_risk;
CREATE TABLE attom_climate_change_risk (
    attomid BIGINT NOT NULL,
    propertylatitude TEXT,
    propertylongitude TEXT,
    situsstatecountyfips TEXT,
    parcelnumberraw TEXT,
    propertyaddressfull TEXT,
    propertyaddresshousenumber TEXT,
    propertyaddressstreetdirection TEXT,
    propertyaddressstreetname TEXT,
    propertyaddressstreetsuffix TEXT,
    propertyaddressstreetpostdirection TEXT,
    propertyaddressunitprefix TEXT,
    propertyaddressunitvalue TEXT,
    propertyaddresscity TEXT,
    propertyaddressstate TEXT,
    propertyaddresszip TEXT,
    propertyaddresszip4 TEXT,
    propertyaddresscrrt TEXT,
    heatriskscore TEXT,
    heatthresholdfahrenheit TEXT,
    heatbaselineaverage TEXT,
    heatfutureaverage TEXT,
    stormriskscore TEXT,
    stormbaselineaveragecounts TEXT,
    stormbaselineaveragetotals TEXT,
    stormfutureaveragecounts TEXT,
    stormfutureaveragetotals TEXT,
    wildfireriskscore TEXT,
    wildfirebaselineaverage TEXT,
    wildfiremaxfutureaverage TEXT,
    droughtriskscore TEXT,
    droughtbaselineaverage TEXT,
    droughtfutureaverage TEXT,
    floodhightidefuture TEXT,
    flooddepthfuture TEXT,
    floodchancefuture TEXT,
    floodfemarisk TEXT,
    floodriskscore TEXT,
    totalrisk TEXT,
    dbcreatedate TEXT,
    dbupdatedate TEXT
);
CREATE INDEX idx_climate_attomid ON attom_climate_change_risk(attomid);
CREATE INDEX idx_climate_fips ON attom_climate_change_risk(situsstatecountyfips);
CREATE INDEX idx_climate_totalrisk ON attom_climate_change_risk(totalrisk);

-- Table 2: Flood Zones Boundary Data
DROP TABLE IF EXISTS attom_boundary_floodzones;
CREATE TABLE attom_boundary_floodzones (
    attomid BIGINT NOT NULL,
    geoid TEXT,
    geotype TEXT,
    dbcreatedate TEXT,
    dbupdatedate TEXT
);
CREATE INDEX idx_floodzones_attomid ON attom_boundary_floodzones(attomid);
CREATE INDEX idx_floodzones_geoid ON attom_boundary_floodzones(geoid);
CREATE INDEX idx_floodzones_geotype ON attom_boundary_floodzones(geotype);

-- Table 3: Building Permit Data
DROP TABLE IF EXISTS attom_building_permit;
CREATE TABLE attom_building_permit (
    buildingpermitid TEXT NOT NULL,
    attomid BIGINT NOT NULL,
    countyname TEXT,
    statecountyfips TEXT,
    propertyaddressfull TEXT,
    propertyaddressaddresshousenumber TEXT,
    propertyaddressaddressstreetdirection TEXT,
    propertyaddressaddressstreetname TEXT,
    propertyaddressaddressstreetsuffix TEXT,
    propertyaddressaddressstreetpostdirection TEXT,
    propertyaddressaddressunitprefix TEXT,
    propertyaddressaddressunit TEXT,
    propertyaddresscity TEXT,
    propertyaddressstate TEXT,
    propertyaddresszip TEXT,
    propertyaddresszip4 TEXT,
    propertyaddresscrrt TEXT,
    propertyaddressinfoprivacy TEXT,
    contactownermailingcounty TEXT,
    contactownermailingfips TEXT,
    contactownermailaddressfull TEXT,
    contactownermailaddresshousenumber TEXT,
    contactownermailaddressstreetdirection TEXT,
    contactownermailaddressstreetname TEXT,
    contactownermailaddressstreetsuffix TEXT,
    contactownermailaddressstreetpostdirection TEXT,
    contactownermailaddressunitprefix TEXT,
    contactownermailaddressunit TEXT,
    contactownermailaddresscity TEXT,
    contactownermailaddressstate TEXT,
    contactownermailaddresszip TEXT,
    contactownermailaddresszip4 TEXT,
    contactownermailaddresscrrt TEXT,
    contactownermailaddressinfoformat TEXT,
    contactownermailinfoprivacy TEXT,
    effectivedate TEXT,
    permitnumber TEXT,
    status TEXT,
    description TEXT,
    type TEXT,
    subtype TEXT,
    projectname TEXT,
    jobvalue TEXT,
    fees TEXT,
    businessname TEXT,
    homeowner TEXT,
    publicationdate TEXT,
    dbcreatedate TEXT,
    dbupdatedate TEXT,
    dbdeletedate TEXT
);
CREATE INDEX idx_permit_attomid ON attom_building_permit(attomid);
CREATE INDEX idx_permit_id ON attom_building_permit(buildingpermitid);
CREATE INDEX idx_permit_fips ON attom_building_permit(statecountyfips);
CREATE INDEX idx_permit_status ON attom_building_permit(status);
CREATE INDEX idx_permit_type ON attom_building_permit(type);
CREATE INDEX idx_permit_effectivedate ON attom_building_permit(effectivedate);