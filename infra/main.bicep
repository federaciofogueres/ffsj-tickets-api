@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Azure Web App name')
param appName string

@description('App Service plan SKU')
param skuName string = 'B1'

@description('Node.js runtime stack')
param linuxFxVersion string = 'NODE|20-lts'

var appServicePlanName = '${appName}-plan'
var appInsightsName = '${appName}-appi'

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: skuName
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: linuxFxVersion
      appCommandLine: 'npm start'
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
    }
  }
}

output webAppName string = webApp.name
output defaultHostname string = webApp.properties.defaultHostName
output appInsightsConnectionString string = appInsights.properties.ConnectionString
