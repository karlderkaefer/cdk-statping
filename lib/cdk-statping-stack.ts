import * as cdk from '@aws-cdk/core';
import * as ecspatterns from '@aws-cdk/aws-ecs-patterns';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as certificatemanager from '@aws-cdk/aws-certificatemanager';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as rds from '@aws-cdk/aws-rds';

export type StatpingProps = {
  vpcProps?: ec2.VpcProps;
  serverlessClusterProps?: rds.ServerlessClusterProps;
  clusterProps?: ecs.ClusterProps;
  fargateServiceProps?: ecspatterns.ApplicationLoadBalancedFargateServiceProps;
  fargateLoadBalancerCidr?: ec2.IPeer;
  clusterName?: string;
  hostedZoneId: string;
  hostedZoneName: string;
  serviceDomainName?: string;
  databaseUsername?: string;
  databaseName?: string;
  statpingAdminUser?: string;
  statpingAdminPassword?: string;
  statpingHeader?: string;
  statpingDescription?: string;
};

function getPropsWithDefaults(props: StatpingProps): StatpingProps {
  const defaultStatpingProps: StatpingProps = {
    databaseUsername: 'statping',
    databaseName: 'statping',
    statpingAdminUser: 'admin',
    statpingAdminPassword: 'helloapes',
    serviceDomainName: 'statping',
    hostedZoneId: '',
    hostedZoneName: '',
    statpingHeader: 'test status page',
    statpingDescription: 'monitor external services',
    fargateLoadBalancerCidr: ec2.Peer.ipv4('0.0.0.0/16'),
  };
  return { ...defaultStatpingProps, ...props };
}

function createDefaultVpc(scope: cdk.Construct, id: string, props: StatpingProps): ec2.IVpc {
  const defaultVPcProps: ec2.VpcProps = {
    cidr: '10.0.0.0/16',
    maxAzs: 2,
    subnetConfiguration: [
      { name: 'ecs_public_', subnetType: ec2.SubnetType.PUBLIC },
      { name: 'ecs_private_', subnetType: ec2.SubnetType.PRIVATE },
      { name: 'aurora_isolated_', subnetType: ec2.SubnetType.ISOLATED },
    ],
  };
  return new ec2.Vpc(scope, `Vpc${id}`, { ...defaultVPcProps, ...props.vpcProps });
}

function createDefaultRds(
  scope: cdk.Construct,
  id: string,
  props: StatpingProps,
  rdsCredentials: rds.Credentials,
  vpc: ec2.IVpc,
  ecsTaskSecurityGroup: ec2.ISecurityGroup
): rds.ServerlessCluster {
  const dbClusterSecurityGroup = new ec2.SecurityGroup(scope, `RdsSecurityGroup${id}`, { vpc });
  dbClusterSecurityGroup.addIngressRule(
    ecsTaskSecurityGroup,
    ec2.Port.tcp(3306),
    'allow ecs cluster to connect to rds'
  );

  const defaultServerlessClusterProps: rds.ServerlessClusterProps = {
    engine: rds.DatabaseClusterEngine.AURORA_MYSQL,
    credentials: rdsCredentials,
    vpc: vpc,
    vpcSubnets: {
      subnetType: ec2.SubnetType.ISOLATED,
    },
    defaultDatabaseName: props.databaseName,
    securityGroups: [dbClusterSecurityGroup],
  };
  return new rds.ServerlessCluster(scope, `Database${id}`, {
    ...defaultServerlessClusterProps,
    ...props.serverlessClusterProps,
  });
}

function createDefaultCluster(scope: cdk.Construct, id: string, props: StatpingProps, vpc: ec2.IVpc) {
  const defaultClusterProps: ecs.ClusterProps = {
    clusterName: props.clusterName,
    enableFargateCapacityProviders: true,
    vpc: vpc,
  };
  const clusterProps = { ...defaultClusterProps, ...props.clusterProps };
  return new ecs.Cluster(scope, id, clusterProps);
}

export class CdkStatpingStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: StatpingProps) {
    super(scope, id);

    props = getPropsWithDefaults(props!);
    const fullDomainName = `${props.serviceDomainName}.${props.hostedZoneName}`;

    const vpc = createDefaultVpc(this, id, props);

    const rdsCredentials = rds.Credentials.fromGeneratedSecret(props.databaseUsername!, {
      secretName: `RdsSecret${id}`,
    });

    const ecsTaskSecurityGroup = new ec2.SecurityGroup(this, `ClusterSecurityGroup${id}`, { vpc });
    const rdsInstance = createDefaultRds(this, id, props, rdsCredentials, vpc, ecsTaskSecurityGroup);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, `HostedZone${id}`, {
      hostedZoneId: props.hostedZoneId!,
      zoneName: props.hostedZoneName!,
    });
    const cert = new certificatemanager.DnsValidatedCertificate(this, `Certificate${id}`, {
      hostedZone: hostedZone,
      domainName: fullDomainName,
    });

    const cluster = createDefaultCluster(this, id, props, vpc);

    const defaultFargateServiceProps: ecspatterns.ApplicationLoadBalancedFargateServiceProps = {
      cluster: cluster,
      cpu: 512,
      desiredCount: 1,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('statping/statping:v0.90.74'),
        containerPort: 8080,
        environment: {
          NAME: props.statpingHeader!,
          DESCRIPTION: props.statpingDescription!,
          DOMAIN: `https://${fullDomainName}`,
          ADMIN_USER: props.statpingAdminUser!,
          ADMIN_PASSWORD: props.statpingAdminPassword!,
          DB_DATABASE: 'statping',
          DB_HOST: rdsInstance.clusterEndpoint.hostname,
          DB_USER: rdsCredentials.username,
          DB_CONN: 'mysql',
          DB_PORT: '3306',
        },
        secrets: {
          DB_PASS: ecs.Secret.fromSecretsManager(rdsInstance.secret!, 'password'),
        },
      },
      memoryLimitMiB: 2048,
      publicLoadBalancer: true,
      certificate: cert,
      domainZone: hostedZone,
      domainName: fullDomainName,
      securityGroups: [ecsTaskSecurityGroup],
      circuitBreaker: {
        rollback: false,
      },
      openListener: true,
      enableECSManagedTags: true,
    };

    const fargateService = new ecspatterns.ApplicationLoadBalancedFargateService(this, 'MyFargateService', {
      ...defaultFargateServiceProps,
      ...props.fargateServiceProps,
    });

    // const albProps : elbv2.AddApplicationActionProps = {
    //   action: elbv2.ListenerAction.authenticateOidc({
    //     authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    //     clientId: "123",
    //     clientSecret: new cdk.SecretValue("123"),
    //     issuer: "https://accounts.google.com",
    //     tokenEndpoint: "https://oauth2.googleapis.com/token",
    //     userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    //     onUnauthenticatedRequest: elbv2.UnauthenticatedAction.AUTHENTICATE,
    //     sessionCookieName: `Auth${id}`,
    //     sessionTimeout: cdk.Duration.days(1),
    //     next: elbv2.ListenerAction.forward([fargateService.targetGroup]),
    //   }),
    // }
    // fargateService.listener.addAction(`OauthForwarding${id}`, albProps)
    // fargateService.listener.addAction(`Redirect${id}`, albProps)
    const loadBalancerSecurityGroup = new ec2.SecurityGroup(this, `LBSecurityGroup${id}`, { vpc });
    loadBalancerSecurityGroup.addIngressRule(
      props.fargateLoadBalancerCidr!,
      ec2.Port.tcp(443),
      'allow https traffic from whitelisted cidr block'
    );
    fargateService.loadBalancer.addSecurityGroup(loadBalancerSecurityGroup);

    // fargateService.targetGroup.configureHealthCheck({path: "/health"})
  }
}
